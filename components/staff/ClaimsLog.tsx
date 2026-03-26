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

function isProvided(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== "pending" && normalized !== "pending staff entry" && normalized !== "pending@staff-entry.edu";
}

export function ClaimsLog() {
  const [claims, setClaims] = useState<ClaimApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<ClaimApiRow | null>(null);
  const [formStudentName, setFormStudentName] = useState("");
  const [formStudentId, setFormStudentId] = useState("");
  const [formStudentEmail, setFormStudentEmail] = useState("");
  const [formDateClaimed, setFormDateClaimed] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState("");

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

  function openClaimModal(claim: ClaimApiRow) {
    setClaiming(claim);
    setFormStudentName(isProvided(claim.student_name) ? claim.student_name.trim() : "");
    setFormStudentId(isProvided(claim.student_id_number) ? claim.student_id_number.trim() : "");
    setFormStudentEmail(isProvided(claim.student_email) ? claim.student_email.trim() : "");
    setFormDateClaimed(new Date().toISOString().slice(0, 10));
    setFormNotes("");
  }

  async function markAsClaimed() {
    if (!claiming) return;
    if (!formStudentName.trim() || !formStudentId.trim()) {
      alert("Student name and Student ID are required.");
      return;
    }
    setBusyId(claiming.id);
    try {
      const res = await fetch("/api/staff/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claiming.id,
          status: "claimed",
          studentName: formStudentName,
          studentIdNumber: formStudentId,
          studentEmail: formStudentEmail,
          itemName: claiming.item?.name ?? "Unknown item",
          dateClaimed: formDateClaimed,
          notes: formNotes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Update failed");
        return;
      }
      setClaiming(null);
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
            <h1 className="text-2xl font-semibold">Claims</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/staff/claimed" className="rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/85 hover:bg-white/5">
              Claimed log
            </Link>
            <Link href="/staff" className="rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/85 hover:bg-white/5">
              Back
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {error ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-base text-red-200">{error}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-base text-[#F5F5F0]/70">
            <Spinner className="h-5 w-5 text-[#CC0000]" />
            Loading claims...
          </div>
        ) : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-base">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/75">
                <tr>
                  <th className="px-4 py-3 font-medium">Student name</th>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Date submitted</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                      No claims yet.
                    </td>
                  </tr>
                ) : null}
                {claims.map((claim) => (
                  <tr key={claim.id} className={claim.status === "pending" ? "bg-[#CC0000]/10" : "bg-black/20"}>
                    <td className="px-4 py-4">
                      {isProvided(claim.student_name) ? (
                        <span className="font-medium">{claim.student_name}</span>
                      ) : (
                        <span className="font-semibold text-red-300">Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isProvided(claim.student_id_number) ? (
                        <span className="text-[#F5F5F0]/80">{claim.student_id_number}</span>
                      ) : (
                        <span className="font-semibold text-red-300">Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {claim.item ? (
                        <div className="flex items-center gap-3">
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
                          <span className="font-medium">{claim.item.name}</span>
                        </div>
                      ) : (
                        <span className="text-[#F5F5F0]/40">Unknown item</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[#F5F5F0]/80">{claim.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-4">
                      {claim.status === "claimed" ? (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-200">Claimed</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === claim.id}
                          onClick={() => openClaimModal(claim)}
                          className="inline-flex min-h-12 items-center rounded-xl bg-[#CC0000] px-4 py-2 text-base font-semibold text-white hover:bg-[#a80000] disabled:opacity-50"
                        >
                          Mark as Claimed
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
      {claiming ? (
        <div className="anim-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <div className="anim-pop-in w-full max-w-lg rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
            <h3 className="text-xl font-semibold text-[#F5F5F0]">Mark as Claimed</h3>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student full name</span>
                <input
                  value={formStudentName}
                  onChange={(e) => setFormStudentName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student ID number</span>
                <input
                  value={formStudentId}
                  onChange={(e) => setFormStudentId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">
                  Student email <span className="text-[#F5F5F0]/45">optional</span>
                </span>
                <input
                  value={formStudentEmail}
                  onChange={(e) => setFormStudentEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Item name</span>
                <input
                  value={claiming.item?.name ?? "Unknown item"}
                  readOnly
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-base text-[#F5F5F0]/70"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Date claimed</span>
                <input
                  type="date"
                  value={formDateClaimed}
                  onChange={(e) => setFormDateClaimed(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">
                  Notes <span className="text-[#F5F5F0]/45">optional</span>
                </span>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClaiming(null)}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-4 py-2 text-base text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void markAsClaimed()}
                disabled={busyId === claiming.id}
                className="inline-flex min-h-12 items-center rounded-xl bg-[#CC0000] px-5 py-2 text-base font-semibold text-white hover:bg-[#a80000] disabled:opacity-50"
              >
                Confirm Claim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
