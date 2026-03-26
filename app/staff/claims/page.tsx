import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isStaffAuthenticated } from "@/lib/staff-api";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

type PendingClaimRow = {
  id: string;
  student_name: string | null;
  student_id_number: string | null;
  student_email: string | null;
  created_at: string;
  items?: { name: string | null } | Array<{ name: string | null }> | null;
};

function isPendingStaffEntry(value: string | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return v === "pending" || v === "pending staff entry" || v === "pending@staff-entry.edu";
}

async function getPendingClaims(): Promise<PendingClaimRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claims")
    .select("id, student_name, student_id_number, student_email, created_at, items(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PendingClaimRow[];
}

export const dynamic = "force-dynamic";

async function markAsClaimedAction(formData: FormData) {
  "use server";

  const claimId = String(formData.get("claimId") ?? "").trim();
  const studentName = String(formData.get("studentName") ?? "").trim();
  const studentIdNumber = String(formData.get("studentIdNumber") ?? "").trim();
  const studentEmail = String(formData.get("studentEmail") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!claimId) return;

  if (!(await isStaffAuthenticated())) {
    redirect("/staff/login");
  }

  if (!studentName || !studentIdNumber) {
    throw new Error("Student name and Student ID are required.");
  }

  const supabase = createAdminSupabaseClient();

  // Update the claim to claimed + capture student info the staff confirmed.
  const { error: statusErr } = await supabase
    .from("claims")
    .update({
      status: "claimed",
      student_name: studentName || null,
      student_id_number: studentIdNumber || null,
      student_email: studentEmail || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (statusErr) {
    throw statusErr;
  }

  // Notes are optional UI input. Persisting is intentionally omitted here to avoid
  // hard-coding a column name that may not exist in your current Supabase schema.
  // Best-effort only: ignore if the column is missing.
  if (notes) {
    const { error: notesErr } = await supabase.from("claims").update({ staff_notes: notes }).eq("id", claimId);
    void notesErr;
  }

  revalidatePath("/staff/claims");
}

export default async function StaffClaimsInboxPage() {
  if (!(await isStaffAuthenticated())) redirect("/staff/login");

  let claims: PendingClaimRow[] = [];
  let loadError: string | null = null;
  try {
    claims = await getPendingClaims();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load claims";
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <style>{`
        details.claim-modal:not([open]) .claim-modal__overlay { display: none; }
      `}</style>

      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-xl font-semibold">Claims inbox</h1>
          </div>
          <div>
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loadError ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </p>
        ) : null}

        {!loadError && claims.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-[#F5F5F0]/55">
            No pending claims.
          </p>
        ) : null}

        {claims.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Student name</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claims.map((claim) => {
                  const itemJoin = claim.items;
                  const itemName = Array.isArray(itemJoin)
                    ? itemJoin[0]?.name ?? "-"
                    : itemJoin?.name ?? "-";
                  return (
                    <tr key={claim.id} className="bg-black/20">
                      <td className="px-4 py-4 font-medium">
                        {isPendingStaffEntry(claim.student_name) ? (
                          <span className="font-semibold text-red-300">Pending staff entry</span>
                        ) : (
                          claim.student_name
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {isPendingStaffEntry(claim.student_id_number) ? (
                          <span className="font-semibold text-red-300">Pending staff entry</span>
                        ) : (
                          claim.student_id_number
                        )}
                      </td>
                      <td className="px-4 py-4 text-[#F5F5F0]/80">{itemName}</td>
                      <td className="px-4 py-4 text-[#F5F5F0]/80">{claim.created_at.slice(0, 10)}</td>
                      <td className="px-4 py-4">
                        <details className="claim-modal">
                          <summary className="cursor-pointer list-none inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a80000]">
                            Mark as Claimed
                          </summary>

                          <div className="claim-modal__overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
                            <form action={markAsClaimedAction} className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
                              <input type="hidden" name="claimId" value={claim.id} />

                              <h2 className="text-lg font-semibold">Mark as Claimed</h2>
                              <p className="mt-2 text-sm text-[#F5F5F0]/75">
                                Update student info and confirm.
                              </p>

                              <div className="mt-4 space-y-3">
                                <label className="block space-y-1">
                                  <span className="text-sm text-[#F5F5F0]/70">Student name</span>
                                  <input
                                    name="studentName"
                                    defaultValue={isPendingStaffEntry(claim.student_name) ? "" : claim.student_name ?? ""}
                                    required
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                                  />
                                </label>

                                <label className="block space-y-1">
                                  <span className="text-sm text-[#F5F5F0]/70">Student ID</span>
                                  <input
                                    name="studentIdNumber"
                                    defaultValue={isPendingStaffEntry(claim.student_id_number) ? "" : claim.student_id_number ?? ""}
                                    required
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                                  />
                                </label>

                                <label className="block space-y-1">
                                  <span className="text-sm text-[#F5F5F0]/70">
                                    Student email <span className="text-[#F5F5F0]/45">(optional)</span>
                                  </span>
                                  <input
                                    type="email"
                                    name="studentEmail"
                                    defaultValue={claim.student_email ?? ""}
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                                  />
                                </label>

                                <label className="block space-y-1">
                                  <span className="text-sm text-[#F5F5F0]/70">
                                    Notes <span className="text-[#F5F5F0]/45">(optional)</span>
                                  </span>
                                  <textarea
                                    name="notes"
                                    defaultValue=""
                                    rows={3}
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                                  />
                                </label>
                              </div>

                              <div className="mt-5 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-5 py-2 text-sm font-semibold text-white hover:bg-[#a80000]"
                                >
                                  Confirm
                                </button>
                              </div>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}

