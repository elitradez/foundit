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
    studentName?: string;
    studentIdNumber?: string;
    phoneNumber?: string;
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
    const studentName = body.studentName?.trim() || "";
    const studentIdNumber = body.studentIdNumber?.trim() || null;
    const phoneNumber = body.phoneNumber?.trim() || null;

    if (!studentName) {
      return NextResponse.json({ error: "Student name is required" }, { status: 400 });
    }

    const { error: claimUpdateErr } = await supabase
      .from("claims")
      .update({
        student_name: studentName,
        student_id_number: studentIdNumber,
        phone_number: phoneNumber,
        status: "returned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    if (claimUpdateErr) {
      // Best-effort if updated_at doesn't exist.
      await supabase
        .from("claims")
        .update({
          student_name: studentName,
          student_id_number: studentIdNumber,
          phone_number: phoneNumber,
          status: "returned",
        })
        .eq("id", claimId);
    }

    const { error: itemErr } = await supabase
      .from("items")
      .update({
        returned_at: new Date().toISOString(),
        sent_to_surplus_at: null,
        returned_student_name: studentName,
        returned_student_id_number: studentIdNumber,
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

  if (action === "surplus") {
    // Remove from pending list
    const { error: claimErr } = await supabase
      .from("claims")
      .update({ status: "claimed", updated_at: new Date().toISOString() })
      .eq("id", claimId);
    if (claimErr) {
      // Best-effort: some schemas may not have updated_at
      await supabase.from("claims").update({ status: "claimed" }).eq("id", claimId);
    }
  }

  return NextResponse.json({ ok: true });
}

