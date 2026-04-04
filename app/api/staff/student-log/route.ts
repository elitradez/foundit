import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type ClaimedRow = {
  id: string;
  item_id: string;
  student_name: string | null;
  student_id_number: string | null;
  phone_number?: string | null;
  status?: "claimed" | "returned";
  created_at: string;
  updated_at: string | null;
};

type ReturnedItemRow = {
  id: string;
  name: string;
  returned_at: string;
  sent_to_surplus_at: string | null;
  returned_student_name: string | null;
  returned_student_id_number: string | null;
};

type ItemRef = { id: string; name: string };

export async function GET() {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();

  const [returnedRes, first] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, returned_at, sent_to_surplus_at, returned_student_name, returned_student_id_number")
      .not("returned_at", "is", null)
      .is("sent_to_surplus_at", null)
      .eq("department_id", session.department_id)
      .order("returned_at", { ascending: false }),
    supabase
      .from("claims")
      .select("id, item_id, student_name, student_id_number, phone_number, status, created_at, updated_at")
      .in("status", ["claimed", "returned"])
      .order("updated_at", { ascending: false }),
  ]);

  if (returnedRes.error) {
    return NextResponse.json({ error: returnedRes.error.message }, { status: 500 });
  }

  let claimedData: ClaimedRow[] | null | undefined = null;

  if (!first.error) {
    claimedData = first.data as ClaimedRow[];
  } else {
    const msg = first.error.message || "";
    if (msg.toLowerCase().includes("phone_number") && msg.toLowerCase().includes("does not exist")) {
      const fallback = await supabase
        .from("claims")
        .select("id, item_id, student_name, student_id_number, status, created_at, updated_at")
        .in("status", ["claimed", "returned"])
        .order("updated_at", { ascending: false });
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      claimedData = (fallback.data ?? []).map((r) => ({ ...(r as ClaimedRow), phone_number: null }));
    } else {
      return NextResponse.json({ error: first.error.message }, { status: 500 });
    }
  }

  const returnedRows = (returnedRes.data ?? []) as ReturnedItemRow[];
  const claimedRows = (claimedData ?? []) as ClaimedRow[];

  // Filter claims to only those whose items belong to this department.
  const deptItemIds = new Set(returnedRows.map((r) => r.id));
  const claimItemIds = Array.from(new Set(claimedRows.map((c) => c.item_id).filter(Boolean)));
  let itemMap = new Map<string, ItemRef>();

  if (claimItemIds.length > 0) {
    const { data: itemData, error: itemErr } = await supabase
      .from("items")
      .select("id, name")
      .in("id", claimItemIds)
      .eq("department_id", session.department_id);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
    itemMap = new Map(((itemData ?? []) as ItemRef[]).map((i) => [i.id, i]));
  }

  // Only include claimed rows whose items are in this department.
  const deptClaimedRows = claimedRows.filter((c) => itemMap.has(c.item_id));

  const itemIdsFromReturnedClaims = new Set(
    deptClaimedRows.filter((c) => c.status === "returned").map((c) => c.item_id),
  );
  const returnedRowsDeduped = returnedRows.filter((r) => !itemIdsFromReturnedClaims.has(r.id));

  // Also add returned items to itemMap for completeness.
  for (const r of returnedRows) {
    if (!itemMap.has(r.id)) deptItemIds.add(r.id);
  }

  const rows = [
    ...returnedRowsDeduped.map((r) => ({
      kind: "returned" as const,
      item_id: r.id,
      item_name: r.name,
      student_name: r.returned_student_name,
      student_id_number: r.returned_student_id_number,
      date: r.returned_at.slice(0, 10),
      status: "Returned" as const,
    })),
    ...deptClaimedRows.map((c) => ({
      kind: c.status === "returned" ? ("returned" as "returned") : ("claimed" as "claimed"),
      claim_id: c.id,
      item_id: c.item_id,
      item_name: itemMap.get(c.item_id)?.name ?? "Unknown item",
      student_name: c.student_name,
      student_id_number: c.student_id_number,
      phone_number: c.phone_number ?? null,
      date: (c.updated_at ?? c.created_at).slice(0, 10),
      status: c.status === "returned" ? ("Returned" as "Returned") : ("Claimed" as "Claimed"),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ rows });
}
