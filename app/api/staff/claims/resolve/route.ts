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

  // Fetch claim and verify item ownership in one query via inner join.
  // This prevents fetching claims that belong to other departments.
  const { data: claim, error: fetchErr } = await supabase
    .from("claims")
    .select("id, item_id, student_name, student_id_number, status, items!inner(department_id, returned_at)")
    .eq("id", claimId)
    .eq("items.department_id", session.department_id)
    .maybeSingle();

  if (fetchErr || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // Guard the state machine. Without these checks the same physical item can be
  // "returned" to multiple claimants, and a claim can be resolved twice.
  const itemRel = (Array.isArray(claim.items) ? claim.items[0] : claim.items) as
    | { returned_at: string | null }
    | undefined;
  if (claim.status === "returned" || claim.status === "claimed" || claim.status === "surplus") {
    return NextResponse.json({ error: "This claim has already been resolved." }, { status: 409 });
  }
  if (itemRel?.returned_at) {
    return NextResponse.json(
      { error: "This item has already been returned or sent to surplus." },
      { status: 409 },
    );
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
    // The item went to surplus — it was NOT returned to this student. Record the
    // claim as "surplus" (a terminal status) rather than "claimed", which would
    // falsely show in the student log as if the student picked the item up.
    const { error: claimErr } = await supabase
      .from("claims")
      .update({ status: "surplus", updated_at: new Date().toISOString() })
      .eq("id", claimId);
    if (claimErr) {
      await supabase.from("claims").update({ status: "surplus" }).eq("id", claimId);
    }
  }

  return NextResponse.json({ ok: true });
}
