import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    claimId?: string;
    itemId?: string;
    studentName?: string;
    studentEmail?: string;
    studentIdNumber?: string;
    notes?: string;
  };

  const claimId = body.claimId?.trim();
  const itemId = body.itemId?.trim();
  const studentName = body.studentName?.trim();
  const studentEmail = body.studentEmail?.trim();
  const studentIdNumber = body.studentIdNumber?.trim();
  const notes = body.notes?.trim() ?? null;

  if (!claimId || !itemId || !studentName || !studentEmail || !studentIdNumber) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("student_info").insert({
    claim_id: claimId,
    item_id: itemId,
    student_name: studentName,
    student_email: studentEmail,
    student_id_number: studentIdNumber,
    notes,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

