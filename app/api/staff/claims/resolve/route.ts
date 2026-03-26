import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    claimId?: string;
    action?: "returned" | "surplus";
  };
  const claimId = body.claimId?.trim();
  const action = body.action;
  if (!claimId || (action !== "returned" && action !== "surplus")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: claim, error: fetchErr } = await supabase
    .from("claims")
    .select("id, item_id, student_name, student_id_number, status")
    .eq("id", claimId)
    .maybeSingle();

  if (fetchErr || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (action === "returned") {
    const { error: itemErr } = await supabase
      .from("items")
      .update({
        returned_at: new Date().toISOString(),
        sent_to_surplus_at: null,
        returned_student_name: claim.student_name ?? null,
        returned_student_id_number: claim.student_id_number ?? null,
      })
      .eq("id", claim.item_id);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  } else {
    const { error: itemErr } = await supabase
      .from("items")
      .update({
        sent_to_surplus_at: new Date().toISOString(),
        returned_at: new Date().toISOString(),
      })
      .eq("id", claim.item_id);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  // Remove from pending list
  const { error: claimErr } = await supabase
    .from("claims")
    .update({ status: "claimed", updated_at: new Date().toISOString() })
    .eq("id", claimId);
  if (claimErr) {
    // Best-effort: some schemas may not have updated_at
    await supabase.from("claims").update({ status: "claimed" }).eq("id", claimId);
  }

  return NextResponse.json({ ok: true });
}

