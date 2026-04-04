import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) {
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

  // Verify this item belongs to the department before relisting.
  const { data: itemRow, error: itemCheckErr } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("department_id", session.department_id)
    .maybeSingle();

  if (itemCheckErr || !itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { error: itemErr } = await supabase
    .from("items")
    .update({
      returned_at: null,
      sent_to_surplus_at: null,
      claim_description: null,
      returned_student_name: null,
      returned_student_id_number: null,
    })
    .eq("id", itemId)
    .eq("department_id", session.department_id);
  if (itemErr) {
    await supabase
      .from("items")
      .update({ returned_at: null, sent_to_surplus_at: null })
      .eq("id", itemId)
      .eq("department_id", session.department_id);
  }

  if (kind === "claimed" && claimId) {
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
