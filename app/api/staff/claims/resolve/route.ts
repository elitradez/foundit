import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) {
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

  // Verify the claim's item belongs to this department.
  const { data: itemRow, error: itemErr } = await supabase
    .from("items")
    .select("id")
    .eq("id", claim.item_id)
    .eq("department_id", session.department_id)
    .maybeSingle();

  if (itemErr || !itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (action === "returned") {
    const studentName = body.studentName?.trim() || "";
    const studentIdNumber = body.studentIdNumber?.trim() || null;
    const phoneNumber = body.phoneNumber?.trim() || null;

    if (!studentName) {
      return NextResponse.json({ error: "Student name is required" }, { status: 400 });
    }
    if (!studentIdNumber && !phoneNumber) {
      return NextResponse.json({ error: "Student ID or phone number is required" }, { status: 400 });
    }

    const updateWithPhone = await supabase
      .from("claims")
      .update({
        student_name: studentName,
        student_id_number: studentIdNumber,
        phone_number: phoneNumber,
        status: "returned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimId);

    if (updateWithPhone.error) {
      const msg = updateWithPhone.error.message || "";
      const phoneMissing =
        msg.toLowerCase().includes("phone_number") && msg.toLowerCase().includes("does not exist");

      const updateWithoutUpdatedAt = await supabase
        .from("claims")
        .update(
          phoneMissing
            ? { student_name: studentName, student_id_number: studentIdNumber, status: "returned" }
            : {
                student_name: studentName,
                student_id_number: studentIdNumber,
                phone_number: phoneNumber,
                status: "returned",
              },
        )
        .eq("id", claimId);

      if (updateWithoutUpdatedAt.error) {
        return NextResponse.json({ error: updateWithoutUpdatedAt.error.message }, { status: 500 });
      }
    }

    const { error: itemUpdateErr } = await supabase
      .from("items")
      .update({
        returned_at: new Date().toISOString(),
        sent_to_surplus_at: null,
        returned_student_name: studentName,
        returned_student_id_number: studentIdNumber,
      })
      .eq("id", claim.item_id)
      .eq("department_id", session.department_id);
    if (itemUpdateErr) return NextResponse.json({ error: itemUpdateErr.message }, { status: 500 });
  } else {
    const { error: surplusErr } = await supabase
      .from("items")
      .update({
        sent_to_surplus_at: new Date().toISOString(),
        returned_at: new Date().toISOString(),
      })
      .eq("id", claim.item_id)
      .eq("department_id", session.department_id);
    if (surplusErr) return NextResponse.json({ error: surplusErr.message }, { status: 500 });
  }

  if (action === "surplus") {
    const { error: claimErr } = await supabase
      .from("claims")
      .update({ status: "claimed", updated_at: new Date().toISOString() })
      .eq("id", claimId);
    if (claimErr) {
      await supabase.from("claims").update({ status: "claimed" }).eq("id", claimId);
    }
  }

  return NextResponse.json({ ok: true });
}
