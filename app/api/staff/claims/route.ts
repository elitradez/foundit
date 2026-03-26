import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, item_id, student_name, student_email, student_id_number, claim_description, status, created_at, updated_at, items(id, name, photo_path, location, date_found)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const claims = (data ?? []).map((row) => ({
    ...row,
    item: Array.isArray(row.items) ? row.items[0] : row.items,
    items: undefined,
  }));
  const pendingCount = claims.filter((c) => c.status === "pending").length;
  return NextResponse.json({ claims, pendingCount });
}

export async function PATCH(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    claimId?: string;
    status?: "claimed";
    studentName?: string;
    studentIdNumber?: string;
    studentEmail?: string;
    itemName?: string;
    dateClaimed?: string;
    notes?: string;
  };
  const claimId = body.claimId?.trim();
  const status = body.status;
  const studentName = body.studentName?.trim();
  const studentIdNumber = body.studentIdNumber?.trim();
  const studentEmail = body.studentEmail?.trim();
  const itemName = body.itemName?.trim();
  const dateClaimed = body.dateClaimed?.trim();
  const notes = body.notes?.trim() ?? "";
  if (!claimId || status !== "claimed") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!studentName || !studentIdNumber || !studentEmail || !itemName || !dateClaimed) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateClaimed)) {
    return NextResponse.json({ error: "Invalid claim date" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: claim, error: claimFetchErr } = await supabase
    .from("claims")
    .select("id, item_id, status, items(id, name, photo_path)")
    .eq("id", claimId)
    .maybeSingle();

  if (claimFetchErr || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.status === "claimed") {
    return NextResponse.json({ error: "Claim already marked as claimed" }, { status: 409 });
  }
  const claimItem = Array.isArray(claim.items) ? claim.items[0] : claim.items;
  if (!claimItem?.id || !claimItem.photo_path) {
    return NextResponse.json({ error: "Missing item data for claim" }, { status: 400 });
  }

  const { error: insertErr } = await supabase.from("claimed_items").insert({
    claim_id: claim.id,
    item_id: claimItem.id,
    item_name: itemName,
    photo_path: claimItem.photo_path,
    student_name: studentName,
    student_id_number: studentIdNumber,
    student_email: studentEmail,
    date_claimed: dateClaimed,
    staff_notes: notes || null,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error } = await supabase.from("claims").update({ status, updated_at: new Date().toISOString() }).eq("id", claimId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

