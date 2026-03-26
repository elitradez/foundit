import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { hashPin } from "@/lib/pin";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
}

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, name, description, location, date_found, photo_path, status, returned_at, surplus_sent_at, claim_description, pin_hash, pin_salt, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const itemIds = (data ?? []).map((i) => i.id);
  const countsByItem: Record<string, { pending: number; total: number }> = {};
  if (itemIds.length > 0) {
    const { data: claims } = await supabase
      .from("claims")
      .select("item_id, status")
      .in("item_id", itemIds);
    for (const c of claims ?? []) {
      const row = (countsByItem[c.item_id] ??= { pending: 0, total: 0 });
      row.total += 1;
      if (c.status === "pending") row.pending += 1;
    }
  }
  const items = (data ?? []).map((item) => ({
    ...item,
    pending_claims_count: countsByItem[item.id]?.pending ?? 0,
    total_claims_count: countsByItem[item.id]?.total ?? 0,
  }));
  const pendingClaimsTotal = items.reduce((acc, i) => acc + (i.pending_claims_count ?? 0), 0);
  return NextResponse.json({ items, pendingClaimsTotal });
}

export async function POST(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("photo");
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const dateFound = String(form.get("date_found") ?? "").trim();
  const optionalPin = String(form.get("optional_pin") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 });
  }
  if (!name || !description || !location || !dateFound) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFound)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const id = randomUUID();
  const photoPath = `${id}/${safeFilename(file.name)}`;
  const bytes = await file.arrayBuffer();
  const supabase = createAdminSupabaseClient();

  const { error: upErr } = await supabase.storage.from("items").upload(photoPath, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  let pin_hash: string | null = null;
  let pin_salt: string | null = null;
  if (optionalPin.length > 0) {
    if (optionalPin.length < 4 || optionalPin.length > 32) {
      return NextResponse.json({ error: "PIN must be 4–32 characters" }, { status: 400 });
    }
    const h = hashPin(optionalPin);
    pin_hash = h.pin_hash;
    pin_salt = h.pin_salt;
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      id,
      name,
      description,
      location,
      date_found: dateFound,
      photo_path: photoPath,
      pin_hash,
      pin_salt,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("items").remove([photoPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
