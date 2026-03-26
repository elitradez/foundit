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
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claimedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[#F5F5F0]/50">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}
