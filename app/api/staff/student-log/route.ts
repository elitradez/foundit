import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type ClaimJoin = { name: string | null } | Array<{ name: string | null }> | null;

type ClaimedRow = {
  id: string;
  item_id: string;
  student_name: string | null;
  student_id_number: string | null;
  created_at: string;
  updated_at: string | null;
  items: ClaimJoin;
};

type ReturnedItemRow = {
  id: string;
  name: string;
  returned_at: string;
  sent_to_surplus_at: string | null;
  returned_student_name: string | null;
  returned_student_id_number: string | null;
};

function joinedItemName(items: ClaimJoin): string {
  if (Array.isArray(items)) return items[0]?.name ?? "Unknown item";
  return items?.name ?? "Unknown item";
}

export async function GET() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: returnedData, error: returnedErr } = await supabase
    .from("items")
    .select("id, name, returned_at, sent_to_surplus_at, returned_student_name, returned_student_id_number")
    .not("returned_at", "is", null)
    .is("sent_to_surplus_at", null)
    .order("returned_at", { ascending: false });

  if (returnedErr) {
    return NextResponse.json({ error: returnedErr.message }, { status: 500 });
  }

  const { data: claimedData, error: claimedErr } = await supabase
    .from("claims")
    .select("id, item_id, student_name, student_id_number, created_at, updated_at, items(name)")
    .eq("status", "claimed")
    .order("updated_at", { ascending: false });

  if (claimedErr) {
    return NextResponse.json({ error: claimedErr.message }, { status: 500 });
  }

  const returnedRows = (returnedData ?? []) as ReturnedItemRow[];
  const claimedRows = (claimedData ?? []) as ClaimedRow[];

  const rows = [
    ...returnedRows.map((r) => ({
      kind: "returned" as const,
      item_id: r.id,
      item_name: r.name,
      student_name: r.returned_student_name,
      student_id_number: r.returned_student_id_number,
      date: r.returned_at.slice(0, 10),
      status: "Returned" as const,
    })),
    ...claimedRows.map((c) => ({
      kind: "claimed" as const,
      claim_id: c.id,
      item_id: c.item_id,
      item_name: joinedItemName(c.items),
      student_name: c.student_name,
      student_id_number: c.student_id_number,
      date: (c.updated_at ?? c.created_at).slice(0, 10),
      status: "Claimed" as const,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ rows });
}

