import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) {
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
  void body;

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("items")
    .update({
      returned_at: new Date().toISOString(),
      sent_to_surplus_at: null,
    })
    .eq("id", id)
    .eq("department_id", session.department_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
