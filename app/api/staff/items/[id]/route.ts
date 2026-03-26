import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("id, photo_path, returned_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (!item.returned_at) {
    return NextResponse.json(
      { error: "Only returned items can be deleted" },
      { status: 400 },
    );
  }

  const { error: rmErr } = await supabase.storage.from("items").remove([item.photo_path]);
  if (rmErr) {
    console.error("Storage remove failed (row will still be deleted):", rmErr.message);
  }

  const { error: delErr } = await supabase.from("items").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
