import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: "returned" | "claimed";
    itemId?: string;
    claimId?: string;
  };
  const kind = body.kind;
  const itemId = body.itemId?.trim();
  const claimId = body.claimId?.trim();
  if (!kind || !itemId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // Put the item back into the active list.
  const { error: itemErr } = await supabase
    .from("items")
    .update({
      returned_at: null,
      sent_to_surplus_at: null,
      claim_description: null,
      returned_student_name: null,
      returned_student_id_number: null,
    })
    .eq("id", itemId);
  if (itemErr) {
    // Best-effort: schema may not have all columns.
    await supabase
      .from("items")
      .update({ returned_at: null, sent_to_surplus_at: null })
      .eq("id", itemId);
  }

  if (kind === "claimed" && claimId) {
    // Remove from claimed log by moving back to pending.
    const { error: claimErr } = await supabase
      .from("claims")
      .update({
        status: "pending",
        student_name: null,
        student_id_number: null,
        student_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    if (claimErr) {
      await supabase.from("claims").update({ status: "pending" }).eq("id", claimId);
    }
  }

  return NextResponse.json({ ok: true });
}

