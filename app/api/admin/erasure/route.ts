import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { checkAdminSecret } from "@/lib/admin-auth";

export const runtime = "nodejs";

type ErasureBody = {
  email?: string;
  phone?: string;
  university_id?: string;
};

export async function POST(req: Request) {
  if (!checkAdminSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dry_run") === "true";

  let body: ErasureBody;
  try {
    body = (await req.json()) as ErasureBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const universityId = body.university_id?.trim() || null;

  if (!email && !phone) {
    return NextResponse.json(
      { error: "At least one of email or phone is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  // -----------------------------------------------------------------------
  // 1. Find matching claims
  // -----------------------------------------------------------------------
  let claimsQuery = supabase.from("claims").select("id, university_id");

  if (email && phone) {
    claimsQuery = claimsQuery.or(`student_email.eq.${email},phone_number.eq.${phone}`);
  } else if (email) {
    claimsQuery = claimsQuery.eq("student_email", email);
  } else {
    claimsQuery = claimsQuery.eq("phone_number", phone!);
  }

  if (universityId) {
    claimsQuery = claimsQuery.eq("university_id", universityId);
  }

  const { data: claims, error: claimsErr } = await claimsQuery;
  if (claimsErr) {
    return NextResponse.json({ error: claimsErr.message }, { status: 500 });
  }

  const claimIds = (claims ?? []).map((c: { id: string }) => c.id);

  if (claimIds.length === 0) {
    return NextResponse.json({ success: true, claims_affected: 0, photos_deleted: 0, photos_failed: 0 });
  }

  // -----------------------------------------------------------------------
  // 2. Dry-run: return counts only, no writes
  // -----------------------------------------------------------------------
  if (dryRun) {
    const [{ count: studentInfoCount }, { count: claimedItemsCount }] = await Promise.all([
      supabase
        .from("student_info")
        .select("id", { count: "exact", head: true })
        .in("claim_id", claimIds),
      supabase
        .from("claimed_items")
        .select("id", { count: "exact", head: true })
        .in("claim_id", claimIds),
    ]);

    return NextResponse.json({
      dry_run: true,
      claims_affected: claimIds.length,
      student_info_rows: studentInfoCount ?? 0,
      claimed_items_rows: claimedItemsCount ?? 0,
    });
  }

  // -----------------------------------------------------------------------
  // 3. Collect proof-of-ownership photo paths before deleting claimed_items
  // -----------------------------------------------------------------------
  const { data: claimedItems } = await supabase
    .from("claimed_items")
    .select("photo_path")
    .in("claim_id", claimIds);

  const photoPaths = (claimedItems ?? [])
    .map((ci: { photo_path: string }) => ci.photo_path)
    .filter(Boolean) as string[];

  // -----------------------------------------------------------------------
  // 4. Delete proof photos from storage
  //    Failures are logged but never block database erasure.
  // -----------------------------------------------------------------------
  let photosDeleted = 0;
  let photosFailed = 0;
  const failedPaths: string[] = [];

  for (const path of photoPaths) {
    const { error: storageErr } = await supabase.storage.from("items").remove([path]);
    if (storageErr) {
      photosFailed++;
      failedPaths.push(path);
      console.error(`[erasure] storage delete failed for "${path}":`, storageErr.message);
    } else {
      photosDeleted++;
    }
  }

  if (failedPaths.length > 0) {
    // Log orphan photos for ops follow-up — never throws, never blocks.
    supabase
      .from("retention_log")
      .insert({
        claims_deleted: 0,
        alerts_deleted: 0,
        notes: `erasure_orphan_photo: ${failedPaths.join(", ")}`,
        storage_paths_deleted: [],
        storage_delete_failures: failedPaths.length,
      })
      .then(({ error }) => {
        if (error) console.error("[erasure] retention_log insert failed:", error.message);
      });
  }

  // -----------------------------------------------------------------------
  // 5. Hard-delete claimed_items (all PII columns are NOT NULL)
  // -----------------------------------------------------------------------
  const { error: ciDeleteErr } = await supabase
    .from("claimed_items")
    .delete()
    .in("claim_id", claimIds);
  if (ciDeleteErr) {
    console.error("[erasure] claimed_items delete failed:", ciDeleteErr.message);
  }

  // -----------------------------------------------------------------------
  // 6. Hard-delete student_info (all PII columns are NOT NULL)
  // -----------------------------------------------------------------------
  const { error: siDeleteErr } = await supabase
    .from("student_info")
    .delete()
    .in("claim_id", claimIds);
  if (siDeleteErr) {
    console.error("[erasure] student_info delete failed:", siDeleteErr.message);
  }

  // -----------------------------------------------------------------------
  // 7. NULL out PII columns in claims (all nullable — rows preserved for
  //    referential integrity with items)
  // -----------------------------------------------------------------------
  const { error: claimsUpdateErr } = await supabase
    .from("claims")
    .update({
      student_name: null,
      student_email: null,
      phone_number: null,
      student_id_number: null,
      claim_description: null,
      description: null,
      staff_notes: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", claimIds);
  if (claimsUpdateErr) {
    console.error("[erasure] claims update failed:", claimsUpdateErr.message);
  }

  // -----------------------------------------------------------------------
  // 8. Audit log — one row per university, no PII captured
  // -----------------------------------------------------------------------
  const byUniversity = new Map<string | null, number>();
  for (const c of claims ?? []) {
    const uid = (c as { university_id: string | null }).university_id ?? null;
    byUniversity.set(uid, (byUniversity.get(uid) ?? 0) + 1);
  }

  for (const [uid, count] of byUniversity) {
    supabase
      .from("security_log")
      .insert({
        event_type: "erasure_admin",
        description: `Right-to-erasure: ${count} claim(s) scrubbed, ${photosDeleted} photo(s) deleted`,
        university_id: uid,
      })
      .then(({ error }) => {
        if (error) console.error("[erasure] security_log insert failed:", error.message);
      });
  }

  return NextResponse.json({
    success: true,
    claims_affected: claimIds.length,
    photos_deleted: photosDeleted,
    photos_failed: photosFailed,
  });
}
