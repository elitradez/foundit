import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getStaffSession } from "@/lib/staff-api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import Image from "next/image";

export const dynamic = "force-dynamic";

type ReturnedItemRow = {
  id: string;
  name: string;
  returned_at: string;
  sent_to_surplus_at: string | null;
};

type ClaimedItemJoin = { name: string | null } | Array<{ name: string | null }> | null;

type ClaimedItemRow = {
  id: string; // claim id
  item_id: string;
  student_name: string | null;
  student_id_number: string | null;
  student_email: string | null;
  created_at: string;
  updated_at: string | null;
  items: ClaimedItemJoin;
};

type StudentLogRow =
  | { kind: "returned"; itemId: string; itemName: string; studentName: string | null; studentIdNumber: string | null; date: string }
  | { kind: "claimed"; claimId: string; itemId: string; itemName: string; studentName: string | null; studentIdNumber: string | null; date: string };

function isPendingStaffEntry(value: string | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return v === "pending" || v === "pending staff entry" || v === "pending@staff-entry.edu";
}

function getJoinedItemName(items: ClaimedItemJoin): string {
  if (Array.isArray(items)) return items[0]?.name ?? "-";
  return items?.name ?? "-";
}

async function relistAction(formData: FormData) {
  "use server";

  const kind = String(formData.get("kind") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const claimId = String(formData.get("claimId") ?? "").trim();

  if (!itemId) return;
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();

  if (kind === "returned") {
    const { error } = await supabase
      .from("items")
      .update({
        returned_at: null,
        sent_to_surplus_at: null,
        claim_description: null,
      })
      .eq("id", itemId)
      .eq("department_id", session.department_id);

    if (error) throw error;

    const { error: claimErr } = await supabase
      .from("claims")
      .update({
        status: "pending",
        student_name: "Pending staff entry",
        student_id_number: "pending",
        student_email: "pending@staff-entry.edu",
        updated_at: new Date().toISOString(),
      })
      .eq("item_id", itemId)
      .eq("status", "claimed");
    void claimErr;
  } else if (kind === "claimed") {
    if (!claimId) return;

    // Verify item belongs to department before relisting.
    const { data: itemRow } = await supabase
      .from("items")
      .select("id")
      .eq("id", itemId)
      .eq("department_id", session.department_id)
      .maybeSingle();
    if (!itemRow) throw new Error("Item not found");

    const { error: claimErr } = await supabase
      .from("claims")
      .update({
        status: "pending",
        student_name: "Pending staff entry",
        student_id_number: "pending",
        student_email: "pending@staff-entry.edu",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimId);

    if (claimErr) throw claimErr;

    const { error: itemErr } = await supabase
      .from("items")
      .update({
        returned_at: null,
        sent_to_surplus_at: null,
        claim_description: null,
      })
      .eq("id", itemId)
      .eq("department_id", session.department_id);

    void itemErr;
  }

  revalidatePath("/staff/claimed");
  revalidatePath("/staff");
  revalidatePath("/staff/claims");
}

async function deleteLogRowAction(formData: FormData) {
  "use server";

  const kind = String(formData.get("kind") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const claimId = String(formData.get("claimId") ?? "").trim();

  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();

  if (kind === "returned") {
    if (!itemId) return;

    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, photo_path, returned_at")
      .eq("id", itemId)
      .eq("department_id", session.department_id)
      .maybeSingle();

    if (fetchErr || !item) {
      throw new Error("Item not found");
    }
    if (!item.returned_at) {
      throw new Error("Only returned items can be deleted");
    }

    const { error: rmErr } = await supabase.storage.from("items").remove([item.photo_path]);
    void rmErr;

    const { error: delErr } = await supabase.from("items").delete().eq("id", itemId);
    if (delErr) throw delErr;
  } else if (kind === "claimed") {
    if (!claimId) return;
    const { error: delErr } = await supabase.from("claims").delete().eq("id", claimId);
    if (delErr) throw delErr;
  }

  revalidatePath("/staff/claimed");
  revalidatePath("/staff");
  revalidatePath("/staff/claims");
}

export default async function StaffClaimedPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();

  const { data: returnedData, error: returnedErr } = await supabase
    .from("items")
    .select("id, name, returned_at, sent_to_surplus_at")
    .not("returned_at", "is", null)
    .is("sent_to_surplus_at", null)
    .eq("department_id", session.department_id)
    .order("returned_at", { ascending: false });

  if (returnedErr) throw returnedErr;

  // Get department item IDs to scope the claims query.
  const deptItemIds = (returnedData ?? []).map((r: { id: string }) => r.id);

  let claimedData: ClaimedItemRow[] = [];
  if (deptItemIds.length > 0) {
    // Also fetch all department item IDs (not just returned ones) for claimed claims.
    const { data: allItemData } = await supabase
      .from("items")
      .select("id")
      .eq("department_id", session.department_id);
    const allDeptItemIds = (allItemData ?? []).map((r: { id: string }) => r.id);

    if (allDeptItemIds.length > 0) {
      const { data, error: claimedErr } = await supabase
        .from("claims")
        .select("id, item_id, student_name, student_id_number, student_email, created_at, updated_at, items(name, photo_path)")
        .eq("status", "claimed")
        .in("item_id", allDeptItemIds)
        .order("updated_at", { ascending: false });

      if (claimedErr) throw claimedErr;
      claimedData = (data ?? []) as ClaimedItemRow[];
    }
  } else {
    // No returned items, but still check for claimed ones.
    const { data: allItemData } = await supabase
      .from("items")
      .select("id")
      .eq("department_id", session.department_id);
    const allDeptItemIds = (allItemData ?? []).map((r: { id: string }) => r.id);

    if (allDeptItemIds.length > 0) {
      const { data, error: claimedErr } = await supabase
        .from("claims")
        .select("id, item_id, student_name, student_id_number, student_email, created_at, updated_at, items(name, photo_path)")
        .eq("status", "claimed")
        .in("item_id", allDeptItemIds)
        .order("updated_at", { ascending: false });

      if (claimedErr) throw claimedErr;
      claimedData = (data ?? []) as ClaimedItemRow[];
    }
  }

  const returnedRows = (returnedData ?? []) as ReturnedItemRow[];
  const claimedRows = claimedData;

  const rows: StudentLogRow[] = [
    ...returnedRows.map((r) => ({
      kind: "returned" as const,
      itemId: r.id,
      itemName: r.name,
      studentName: null,
      studentIdNumber: null,
      date: r.returned_at.slice(0, 10),
    })),
    ...claimedRows.map((r) => ({
      kind: "claimed" as const,
      claimId: r.id,
      itemId: r.item_id,
      itemName: getJoinedItemName(r.items),
      studentName: r.student_name,
      studentIdNumber: r.student_id_number,
      date: (r.updated_at ?? r.created_at).slice(0, 10),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
            >
              Return to student view
            </Link>
            <Link
              href="/staff"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
            >
              Back
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
              <tr>
                <th className="px-4 py-3 font-medium">Photo</th>
                <th className="px-4 py-3 font-medium">Item name</th>
                <th className="px-4 py-3 font-medium">Student name</th>
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Date claimed</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                    No claimed or returned items.
                  </td>
                </tr>
              ) : null}

              {rows.map((row) => (
                <tr key={row.kind === "returned" ? `r-${row.itemId}` : `c-${row.claimId}`} className="bg-black/20">
                  <td className="px-4 py-4">
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10">
                      <Image
                        src={`/api/staff/items/${row.itemId}/photo`}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[#F5F5F0]/85">{row.itemName}</td>
                  <td className="px-4 py-4">{isPendingStaffEntry(row.studentName) ? <span className="font-semibold text-red-300">Pending staff entry</span> : row.studentName}</td>
                  <td className="px-4 py-4">{isPendingStaffEntry(row.studentIdNumber) ? <span className="font-semibold text-red-300">Pending staff entry</span> : row.studentIdNumber}</td>
                  <td className="px-4 py-4 text-[#F5F5F0]/80">{row.date}</td>
                  <td className="px-4 py-4">{row.kind === "returned" ? "Returned" : "Claimed"}</td>
                  <td className="px-4 py-4">
                    <details className="relative">
                      <summary className="cursor-pointer list-none inline-flex min-h-11 items-center rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600">
                        Relist
                      </summary>
                      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4">
                        <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
                          <h3 className="text-lg font-semibold text-[#F5F5F0]">
                            Are you sure? This will put the item back in the active list.
                          </h3>
                          <form
                            action={relistAction}
                            className="mt-5"
                          >
                            <input type="hidden" name="kind" value={row.kind} />
                            <input type="hidden" name="itemId" value={row.itemId} />
                            {row.kind === "claimed" ? <input type="hidden" name="claimId" value={row.claimId} /> : null}
                            <div className="mt-5 flex justify-end gap-2">
                              <button
                                type="submit"
                                className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                              >
                                Confirm
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </details>
                  </td>
                  <td className="px-4 py-4">
                    <details className="relative">
                      <summary className="cursor-pointer list-none inline-flex items-center rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#F5F5F0]/70 hover:bg-white/5">
                        Delete
                      </summary>
                      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
                        <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
                          <h3 className="text-lg font-semibold text-[#F5F5F0]">Delete this log entry?</h3>
                          <p className="mt-2 text-sm text-[#F5F5F0]/75">
                            {row.kind === "returned"
                              ? "This permanently deletes the returned item and its photo."
                              : "This removes the claim record from the log."}
                          </p>
                          <form action={deleteLogRowAction} className="mt-5">
                            <input type="hidden" name="kind" value={row.kind} />
                            <input type="hidden" name="itemId" value={row.itemId} />
                            {row.kind === "claimed" ? <input type="hidden" name="claimId" value={row.claimId} /> : null}
                            <div className="mt-5 flex justify-end gap-2">
                              <Link
                                href="/staff/claimed"
                                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
                              >
                                Cancel
                              </Link>
                              <button
                                type="submit"
                                className="inline-flex min-h-11 items-center rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500"
                              >
                                Confirm delete
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
