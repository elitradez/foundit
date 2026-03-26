import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  const { data: item, error } = await supabase
    .from("items")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: file, error: dlErr } = await supabase.storage.from("items").download(item.photo_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": file.type || "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}

