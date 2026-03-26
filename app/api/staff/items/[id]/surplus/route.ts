import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const supabase = createAdminSupabaseClient();
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, name, photo_path, location, date_found, created_at, status")
    .eq("id", id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (item.status === "surplus") {
    return NextResponse.json({ ok: true });
  }

  const daysOld = Math.floor(
    (Date.now() - new Date(`${item.date_found}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24),
  );

  const { count: pendingClaims } = await supabase
    .from("claims")
    .select("*", { head: true, count: "exact" })
    .eq("item_id", id)
    .eq("status", "pending");

  if ((pendingClaims ?? 0) > 0) {
    return NextResponse.json({ error: "Resolve pending claims first" }, { status: 409 });
  }
  if (daysOld < 30) {
    return NextResponse.json(
      { error: "Item must be 30+ days old before sending to surplus" },
      { status: 400 },
    );
  }

  const { error: logErr } = await supabase.from("surplus_and_salvage").insert({
    item_id: item.id,
    item_name: item.name,
    photo_path: item.photo_path,
    location_found: item.location,
    date_found: item.date_found,
    date_logged: item.created_at,
    date_sent_to_surplus: now,
  });
  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: "surplus",
      surplus_sent_at: now,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

