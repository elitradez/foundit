import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claimed_items")
    .select("id, claim_id, item_id, item_name, photo_path, student_name, student_id_number, student_email, date_claimed, staff_notes, created_at, items(status)")
    .order("date_claimed", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const claimedItems = (data ?? []).map((row) => ({
    ...row,
    item_status: Array.isArray(row.items) ? row.items[0]?.status ?? null : row.items?.status ?? null,
    items: undefined,
  }));
  return NextResponse.json({ claimedItems });
}

export async function PATCH(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { claimedItemId?: string };
  const claimedItemId = body.claimedItemId?.trim();
  if (!claimedItemId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from("claimed_items")
    .select("id, claim_id, item_id")
    .eq("id", claimedItemId)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Claimed item not found" }, { status: 404 });
  }

  const { error: itemErr } = await supabase
    .from("items")
    .update({ status: "active", claim_description: null, returned_at: null, surplus_sent_at: null })
    .eq("id", row.item_id);
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  const { error: claimErr } = await supabase
    .from("claims")
    .update({
      status: "returned",
      student_name: "",
      student_id_number: "",
      student_email: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.claim_id);
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
