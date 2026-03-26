import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, item_id, student_name, student_email, student_id_number, claim_description, status, created_at, updated_at, items(id, name, photo_path, location, date_found)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const claims = (data ?? []).map((row) => ({
    ...row,
    item: Array.isArray(row.items) ? row.items[0] : row.items,
    items: undefined,
  }));
  const pendingCount = claims.filter((c) => c.status === "pending").length;
  return NextResponse.json({ claims, pendingCount });
}

export async function PATCH(req: Request) {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { claimId?: string; status?: "approved" | "returned" };
  const claimId = body.claimId?.trim();
  const status = body.status;
  if (!claimId || !status || (status !== "approved" && status !== "returned")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("claims")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

