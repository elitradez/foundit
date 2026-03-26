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
  // Student fields are optional. If your DB schema doesn't include returned-student columns,
  // we just don't persist them (the item will still be marked returned).
  void body;

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("items")
    .update({
      returned_at: new Date().toISOString(),
      sent_to_surplus_at: null,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
