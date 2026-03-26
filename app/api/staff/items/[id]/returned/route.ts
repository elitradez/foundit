import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    studentName?: string;
    studentIdNumber?: string;
  };
  const studentName = body.studentName?.trim() || null;
  const studentIdNumber = body.studentIdNumber?.trim() || null;

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("items")
    .update({
      returned_at: new Date().toISOString(),
      sent_to_surplus_at: null,
      returned_student_name: studentName,
      returned_student_id_number: studentIdNumber,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
