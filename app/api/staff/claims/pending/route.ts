import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type PendingClaimRow = {
  id: string;
  item_id: string;
  student_name: string | null;
  student_id_number: string | null;
  created_at: string;
};

type ItemRef = {
  id: string;
  name: string;
  date_found: string | null;
};

export async function GET() {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();

  // Fetch department's active item IDs first so claims are scoped to this department.
  const { data: itemData, error: itemErr } = await supabase
    .from("items")
    .select("id, name, date_found")
    .eq("department_id", session.department_id);

  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  const deptItems = (itemData ?? []) as ItemRef[];
  const deptItemIds = deptItems.map((i) => i.id);

  if (deptItemIds.length === 0) {
    return NextResponse.json({ claims: [] });
  }

  const { data, error } = await supabase
    .from("claims")
    .select("id, item_id, student_name, student_id_number, created_at")
    .eq("status", "pending")
    .in("item_id", deptItemIds)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PendingClaimRow[];
  const itemMap = new Map(deptItems.map((i) => [i.id, i]));

  const claims = rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    item_name: itemMap.get(r.item_id)?.name ?? "Unknown item",
    date_found: itemMap.get(r.item_id)?.date_found ?? null,
    student_name: r.student_name,
    student_id_number: r.student_id_number,
    created_at: r.created_at,
  }));

  return NextResponse.json({ claims });
}
