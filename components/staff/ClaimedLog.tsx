"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { ClaimedItemRow } from "@/lib/types";

export function ClaimedLog() {
  const [claimedItems, setClaimedItems] = useState<ClaimedItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [relistCandidate, setRelistCandidate] = useState<ClaimedItemRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/claimed");
      const data = (await res.json().catch(() => ({}))) as { claimedItems?: ClaimedItemRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load claimed items");
        return;
      }
      setClaimedItems(data.claimedItems ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function relistItem() {
    if (!relistCandidate) return;
    setBusyId(relistCandidate.id);
    try {
      const res = await fetch("/api/staff/claimed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedItemId: relistCandidate.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not relist item");
        return;
      }
      setRelistCandidate(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-2xl font-semibold">Claimed items log</h1>
          </div>
          <Link href="/staff/claims" className="rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/85 hover:bg-white/5">
            Back
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {error ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-base text-red-200">{error}</p>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-base text-[#F5F5F0]/70">
            <Spinner className="h-5 w-5 text-[#CC0000]" />
            Loading claimed items...
          </div>
        ) : null}
        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[1100px] text-left text-base">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/75">
                <tr>
                  <th className="px-4 py-3 font-medium">Item photo</th>
                  <th className="px-4 py-3 font-medium">Item name</th>
                  <th className="px-4 py-3 font-medium">Student name</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Student email</th>
                  <th className="px-4 py-3 font-medium">Date claimed</th>
                  <th className="px-4 py-3 font-medium">Staff notes</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claimedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                      No claimed items recorded yet.
                    </td>
                  </tr>
                ) : null}
                {claimedItems.map((row) => (
                  <tr key={row.id} className="bg-black/20">
                    <td className="px-4 py-3">
                      <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10">
                        <Image src={`/api/staff/items/${row.item_id}/photo`} alt="" fill className="object-cover" sizes="48px" unoptimized />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{row.item_name}</td>
                    <td className="px-4 py-3">{row.student_name}</td>
                    <td className="px-4 py-3">{row.student_id_number}</td>
                    <td className="px-4 py-3">{row.student_email}</td>
                    <td className="px-4 py-3">{row.date_claimed}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{row.staff_notes ?? "-"}</td>
                    <td className="px-4 py-3">
                      {row.item_status === "active" ? (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-200">Relisted</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setRelistCandidate(row)}
                          className="inline-flex min-h-10 items-center rounded-xl bg-zinc-700 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
                        >
                          Relist Item
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
      {relistCandidate ? (
        <div className="anim-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#F5F5F0]">Relist Item</h3>
            <p className="mt-2 text-sm text-[#F5F5F0]/75">
              Are you sure you want to relist this item? It will appear back in the active items list.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRelistCandidate(null)}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void relistItem()}
                disabled={busyId === relistCandidate.id}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a80000] disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
