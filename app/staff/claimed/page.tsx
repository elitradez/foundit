import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getStaffSession } from "@/lib/staff-api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import Image from "next/image";
import { RelistModalButton } from "@/components/staff/RelistModalButton";
import { DeleteLogRowModalButton } from "@/components/staff/DeleteLogRowModalButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Student Log — Staff",
};

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
    // Verify the item belongs to this department before touching its claims —
    // otherwise a crafted itemId could reset claims in another department.
    const { data: itemRow } = await supabase
      .from("items")
      .select("id")
      .eq("id", itemId)
      .eq("department_id", session.department_id)
      .maybeSingle();
    if (!itemRow) throw new Error("Item not found");

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
    // Only allow deleting a claim whose item belongs to this department.
    const { data: claimRow } = await supabase
      .from("claims")
      .select("id, items!inner(department_id)")
      .eq("id", claimId)
      .eq("items.department_id", session.department_id)
      .maybeSingle();
    if (!claimRow) throw new Error("Claim not found");
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

  let returnedRows: ReturnedItemRow[] = [];
  let claimedRows: ClaimedItemRow[] = [];
  let loadError: string | null = null;

  try {
    const { data: returnedData, error: returnedErr } = await supabase
      .from("items")
      .select("id, name, returned_at, sent_to_surplus_at")
      .not("returned_at", "is", null)
      .is("sent_to_surplus_at", null)
      .eq("department_id", session.department_id)
      .order("returned_at", { ascending: false });

    if (returnedErr) throw returnedErr;

    returnedRows = (returnedData ?? []) as ReturnedItemRow[];

    // Fetch all department item IDs to scope the claims query.
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
      claimedRows = (data ?? []) as ClaimedItemRow[];
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load data";
  }

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
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#FF4444]">Staff</p>
            <h1 className="text-xl font-semibold">Student log</h1>
          </div>
          <nav aria-label="Site navigation" className="flex items-center gap-2">
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
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">
        {loadError ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1000px] text-left text-sm" aria-label="Claimed and returned items">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Photo</th>
                <th scope="col" className="px-4 py-3 font-medium">Item name</th>
                <th scope="col" className="px-4 py-3 font-medium">Student name</th>
                <th scope="col" className="px-4 py-3 font-medium">Student ID</th>
                <th scope="col" className="px-4 py-3 font-medium">Date claimed</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Relist</span></th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Delete</span></th>
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
                        alt={`Photo of ${row.itemName}`}
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
                    <RelistModalButton
                      itemId={row.itemId}
                      kind={row.kind}
                      claimId={row.kind === "claimed" ? row.claimId : undefined}
                      action={relistAction}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <DeleteLogRowModalButton
                      itemId={row.itemId}
                      kind={row.kind}
                      claimId={row.kind === "claimed" ? row.claimId : undefined}
                      action={deleteLogRowAction}
                    />
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
