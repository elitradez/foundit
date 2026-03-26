"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { ClaimRow } from "@/lib/types";

type ClaimApiRow = ClaimRow & {
  item?: {
    id: string;
    name: string;
    photo_path: string;
    location: string;
    date_found: string;
  };
};

export function ClaimsLog() {
  const [claims, setClaims] = useState<ClaimApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/claims");
      const data = (await res.json().catch(() => ({}))) as { claims?: ClaimApiRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load claims");
        return;
      }
      setClaims(data.claims ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(claimId: string, status: "approved" | "returned") {
    setBusyId(claimId);
    try {
      const res = await fetch("/api/staff/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Update failed");
        return;
      }
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
            <h1 className="text-xl font-semibold">Claims log</h1>
          </div>
          <Link href="/staff" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5">
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {error ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
            <Spinner className="h-5 w-5 text-[#CC0000]" />
            Loading claims...
          </div>
        ) : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Student name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Item claimed</th>
                  <th className="px-4 py-3 font-medium">Photo</th>
                  <th className="px-4 py-3 font-medium">Date of claim</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                      No claims yet.
                    </td>
                  </tr>
                ) : null}
                {claims.map((claim) => (
                  <tr key={claim.id} className="bg-black/20">
                    <td className="px-4 py-3">{claim.student_name}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{claim.student_email}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{claim.student_id_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{claim.item?.name ?? "Unknown item"}</div>
                      <div className="text-xs text-[#F5F5F0]/50">{claim.item?.location ?? "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {claim.item ? (
                        <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10">
                          <Image
                            src={`/api/staff/items/${claim.item.id}/photo`}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="48px"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <span className="text-[#F5F5F0]/40">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{claim.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          claim.status === "pending"
                            ? "bg-amber-500/15 text-amber-200"
                            : claim.status === "approved"
                              ? "bg-sky-500/15 text-sky-200"
                              : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === claim.id || claim.status === "approved"}
                          onClick={() => void updateStatus(claim.id, "approved")}
                          className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === claim.id || claim.status === "returned"}
                          onClick={() => void updateStatus(claim.id, "returned")}
                          className="inline-flex min-h-10 items-center rounded-lg border border-emerald-500/35 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          Returned
                        </button>
                      </div>
                    </td>
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
