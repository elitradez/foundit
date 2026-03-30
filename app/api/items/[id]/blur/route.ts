import sharp from "sharp";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  const { data: item, error } = await supabase
    .from("items")
    .select("photo_path, returned_at, value_tier")
    .eq("id", id)
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (item.returned_at) {
    return NextResponse.json({ error: "Not available" }, { status: 410 });
  }

  const { data: file, error: dlErr } = await supabase.storage.from("items").download(item.photo_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const lowValue = item.value_tier === "low_value";

  const out = lowValue
    ? await sharp(buf)
        .rotate()
        .resize({ width: 640, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()
    : await sharp(buf)
        .rotate()
        .resize({ width: 640, withoutEnlargement: true })
        .blur(24)
        .jpeg({ quality: 70 })
        .toBuffer();

  return new Response(new Uint8Array(out), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=3600",
    },
  });
}

