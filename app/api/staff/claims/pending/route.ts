import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type ClaimJoin = { id: string; name: string; date_found: string | null } | Array<{ id: string; name: string; date_found: string | null }> | null;

type PendingClaimRow = {
  id: string;
  item_id: string;
  student_name: string | null;
  student_id_number: string | null;
  created_at: string;
  items: ClaimJoin;
};

function joinedItemName(items: ClaimJoin): string {
  if (Array.isArray(items)) return items[0]?.name ?? "Unknown item";
  return items?.name ?? "Unknown item";
}

function joinedItemDateFound(items: ClaimJoin): string | null {
  if (Array.isArray(items)) return items[0]?.date_found ?? null;
  return items?.date_found ?? null;
}

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claims")
    .select("id, item_id, student_name, student_id_number, created_at, items(id, name, date_found)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PendingClaimRow[];
  const claims = rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    item_name: joinedItemName(r.items),
    date_found: joinedItemDateFound(r.items),
    student_name: r.student_name,
    student_id_number: r.student_id_number,
    created_at: r.created_at,
  }));

  return NextResponse.json({ claims });
}

