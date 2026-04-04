import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from("items")
    .select("id, photo_path, returned_at, department_id")
    .eq("id", id)
    .eq("department_id", session.department_id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (row.returned_at) {
    return NextResponse.json({ error: "Cannot edit returned items" }, { status: 400 });
  }

  const ct = req.headers.get("content-type") ?? "";
  let name: string;
  let description: string;
  let location: string;
  let date_found: string;
  let photoFile: File | null = null;

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    name = String(form.get("name") ?? "").trim();
    description = String(form.get("description") ?? "").trim();
    location = String(form.get("location") ?? "").trim();
    date_found = String(form.get("date_found") ?? "").trim();
    const f = form.get("photo");
    if (f instanceof File && f.size > 0) photoFile = f;
  } else {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      location?: string;
      date_found?: string;
    };
    name = String(body.name ?? "").trim();
    description = String(body.description ?? "").trim();
    location = String(body.location ?? "").trim();
    date_found = String(body.date_found ?? "").trim();
  }

  if (!name || !description || !location || !date_found) {
    return NextResponse.json({ error: "Name, description, location, and date are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_found)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  let photo_path = row.photo_path;
  if (photoFile) {
    const newPath = `${id}/${safeFilename(photoFile.name)}`;
    const bytes = await photoFile.arrayBuffer();
    const { error: upErr } = await supabase.storage.from("items").upload(newPath, bytes, {
      contentType: photoFile.type || "image/jpeg",
      upsert: true,
    });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    if (row.photo_path && row.photo_path !== newPath) {
      await supabase.storage.from("items").remove([row.photo_path]);
    }
    photo_path = newPath;
  }

  const { error: updErr } = await supabase
    .from("items")
    .update({ name, description, location, date_found, photo_path })
    .eq("id", id)
    .eq("department_id", session.department_id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) {
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
    .eq("department_id", session.department_id)
    .maybeSingle();

  if (fetchErr || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { error: claimDelErr } = await supabase.from("claims").delete().eq("item_id", id);
  if (claimDelErr) {
    console.error("claims delete (continuing):", claimDelErr.message);
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
