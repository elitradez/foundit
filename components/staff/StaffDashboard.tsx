"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogItemForm } from "@/components/staff/LogItemForm";
import { Spinner } from "@/components/ui/Spinner";
import type { ItemRow } from "@/lib/types";

function daysSinceFound(dateFound: string): number {
  const found = new Date(`${dateFound}T00:00:00`).getTime();
  const now = Date.now();
  return Math.floor((now - found) / (1000 * 60 * 60 * 24));
}

type Tab = "active" | "claims" | "log";

type PendingClaim = {
  id: string;
  item_id: string;
  item_name: string;
  student_name: string | null;
  student_id_number: string | null;
  created_at: string;
};

type StudentLogRow = {
  kind: "returned" | "claimed";
  item_id: string;
  item_name: string;
  student_name: string | null;
  student_id_number: string | null;
  date: string;
  status: "Returned" | "Claimed";
  claim_id?: string;
};

export function StaffDashboard() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [logRows, setLogRows] = useState<StudentLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [editReturnedItemId, setEditReturnedItemId] = useState<string | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentIdNumber, setEditStudentIdNumber] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff/items");
      const data = (await res.json().catch(() => ({}))) as { items?: ItemRow[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load items");
        return;
      }
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = useMemo(() => items.filter((i) => !i.returned_at), [items]);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);
    try {
      const res = await fetch("/api/staff/claims/pending");
      const data = (await res.json().catch(() => ({}))) as { claims?: PendingClaim[]; error?: string };
      if (!res.ok) {
        setClaimsError(data.error ?? "Could not load claims");
        return;
      }
      setClaims(data.claims ?? []);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  const loadStudentLog = useCallback(async () => {
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await fetch("/api/staff/student-log");
      const data = (await res.json().catch(() => ({}))) as { rows?: StudentLogRow[]; error?: string };
      if (!res.ok) {
        setLogError(data.error ?? "Could not load student log");
        return;
      }
      setLogRows(data.rows ?? []);
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "claims") void loadClaims();
    if (tab === "log") void loadStudentLog();
  }, [tab, loadClaims, loadStudentLog]);

  async function markReturned(itemId: string) {
    setBusyId(itemId);
    try {
      const res = await fetch(`/api/staff/items/${itemId}/returned`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to mark returned");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function sendToSurplus(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/items/${id}/surplus`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to send to surplus");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function resolveClaim(claimId: string, action: "returned" | "surplus") {
    setBusyId(claimId);
    try {
      const res = await fetch("/api/staff/claims/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to update claim");
        return;
      }
      await load();
      await loadClaims();
    } finally {
      setBusyId(null);
    }
  }

  async function relist(row: StudentLogRow) {
    setBusyId(row.kind === "claimed" ? row.claim_id ?? row.item_id : row.item_id);
    try {
      const res = await fetch("/api/staff/relist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, itemId: row.item_id, claimId: row.claim_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to relist");
        return;
      }
      await load();
      await loadStudentLog();
      if (tab === "claims") await loadClaims();
    } finally {
      setBusyId(null);
    }
  }

  function openEditStudentInfo(row: StudentLogRow) {
    if (row.kind !== "returned") return;
    setEditReturnedItemId(row.item_id);
    setEditStudentName(row.student_name ?? "");
    setEditStudentIdNumber(row.student_id_number ?? "");
  }

  async function saveStudentInfo() {
    if (!editReturnedItemId) return;
    setBusyId(editReturnedItemId);
    try {
      const res = await fetch(`/api/staff/items/${editReturnedItemId}/return-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: editStudentName || null,
          studentIdNumber: editStudentIdNumber || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to save student info");
        return;
      }
      setEditReturnedItemId(null);
      await loadStudentLog();
    } finally {
      setBusyId(null);
    }
  }

  function TabButton({ id, label }: { id: Tab; label: string }) {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold transition ${
          active
            ? "border-[#CC0000]/60 bg-[#CC0000]/25 text-[#F5F5F0]"
            : "border-white/10 bg-white/[0.03] text-[#F5F5F0]/75 hover:bg-white/[0.06]"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-xl font-semibold">Foundit dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-4 py-2 text-sm font-medium text-white hover:bg-[#a80000]"
            >
              Log new item
            </button>
            <TabButton id="active" label="Active Items" />
            <TabButton id="claims" label="Claims" />
            <TabButton id="log" label="Student Log" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loadError ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</p>
        ) : null}

        {tab === "active" ? (
          <>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
                <Spinner className="h-5 w-5 text-[#CC0000]" />
                Loading active items...
              </div>
            ) : null}

            {!loading && activeItems.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center text-[#F5F5F0]/55">
                No active items.
              </p>
            ) : null}

            {!loading && activeItems.length > 0 ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {activeItems.map((item) => {
                  const daysOld = daysSinceFound(item.date_found);
                  const canSendToSurplus = daysOld >= 30;
                  const daysRemaining = Math.max(0, 30 - daysOld);
                  const surplusText = canSendToSurplus ? "Send to Surplus" : `Surplus in ${daysRemaining} days`;

                  return (
                    <li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex gap-4">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10">
                          <Image src={`/api/staff/items/${item.id}/photo`} alt="" fill className="object-cover" sizes="80px" unoptimized />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-base font-semibold text-[#F5F5F0]">{item.name}</p>
                          <p className="truncate text-sm text-[#F5F5F0]/75">{item.location}</p>
                          <p className="text-xs text-[#F5F5F0]/45">Found {item.date_found}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void markReturned(item.id)}
                          className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {busyId === item.id ? "..." : "Returned"}
                        </button>

                        <button
                          type="button"
                          disabled={!canSendToSurplus || busyId === item.id}
                          onClick={() => void sendToSurplus(item.id)}
                          className="inline-flex min-h-11 items-center rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={!canSendToSurplus ? "Available after 30 days" : undefined}
                        >
                          {busyId === item.id ? "..." : surplusText}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}

        {tab === "claims" ? (
          <>
            {claimsError ? (
              <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {claimsError}
              </p>
            ) : null}
            {claimsLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
                <Spinner className="h-5 w-5 text-[#CC0000]" />
                Loading pending claims...
              </div>
            ) : null}

            {!claimsLoading ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
                    <tr>
                      <th className="px-4 py-3 font-medium">Photo</th>
                      <th className="px-4 py-3 font-medium">Item</th>
                      <th className="px-4 py-3 font-medium">Student name</th>
                      <th className="px-4 py-3 font-medium">Student ID</th>
                      <th className="px-4 py-3 font-medium">Date submitted</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {claims.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                          No pending claims.
                        </td>
                      </tr>
                    ) : null}
                    {claims.map((c) => (
                      <tr key={c.id} className="bg-black/20">
                        <td className="px-4 py-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10">
                            <Image src={`/api/staff/items/${c.item_id}/photo`} alt="" fill className="object-cover" sizes="48px" unoptimized />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">{c.item_name}</td>
                        <td className="px-4 py-3 text-[#F5F5F0]/85">
                          {c.student_name?.trim() ? c.student_name : <span className="text-[#F5F5F0]/55">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#F5F5F0]/85">
                          {c.student_id_number?.trim() ? c.student_id_number : <span className="text-[#F5F5F0]/55">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#F5F5F0]/70">{c.created_at.slice(0, 10)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => void resolveClaim(c.id, "returned")}
                              className="inline-flex min-h-10 items-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              Mark as Returned
                            </button>
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => void resolveClaim(c.id, "surplus")}
                              className="inline-flex min-h-10 items-center rounded-xl bg-zinc-700 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
                            >
                              Send to Surplus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "log" ? (
          <>
            {logError ? (
              <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {logError}
              </p>
            ) : null}
            {logLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
                <Spinner className="h-5 w-5 text-[#CC0000]" />
                Loading student log...
              </div>
            ) : null}
            {!logLoading ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
                    <tr>
                      <th className="px-4 py-3 font-medium">Item name</th>
                      <th className="px-4 py-3 font-medium">Student name</th>
                      <th className="px-4 py-3 font-medium">Student ID</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {logRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                          No returned or claimed items.
                        </td>
                      </tr>
                    ) : null}
                    {logRows.map((r) => (
                      <tr key={`${r.kind}-${r.claim_id ?? r.item_id}`} className="bg-black/20">
                        <td className="px-4 py-3 font-medium">{r.item_name}</td>
                        <td className="px-4 py-3 text-[#F5F5F0]/85">
                          {r.student_name?.trim() ? r.student_name : <span className="text-[#F5F5F0]/55">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#F5F5F0]/85">
                          {r.student_id_number?.trim() ? r.student_id_number : <span className="text-[#F5F5F0]/55">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#F5F5F0]/70">{r.date}</td>
                        <td className="px-4 py-3">{r.status}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {r.kind === "returned" ? (
                              <button
                                type="button"
                                disabled={busyId === r.item_id}
                                onClick={() => openEditStudentInfo(r)}
                                className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.06] disabled:opacity-50"
                              >
                                Add/Edit student info
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busyId === (r.kind === "claimed" ? r.claim_id ?? r.item_id : r.item_id)}
                              onClick={() => void relist(r)}
                              className="inline-flex min-h-10 items-center rounded-xl bg-zinc-700 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
                            >
                              Relist
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-center">
        <a
          href="/"
          className="text-sm font-medium text-[#CC0000] underline decoration-[#CC0000]/40 underline-offset-4 hover:text-[#e02020] hover:decoration-[#CC0000]/70"
        >
          Return to student view
        </a>
      </footer>

      {showForm ? <LogItemForm onClose={() => setShowForm(false)} onSaved={() => void load()} /> : null}

      {editReturnedItemId ? (
        <div className="anim-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#F5F5F0]">Returned item student info</h3>
            <p className="mt-2 text-sm text-[#F5F5F0]/70">This will appear in the Student Log.</p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student name</span>
                <input
                  value={editStudentName}
                  onChange={(e) => setEditStudentName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student ID</span>
                <input
                  value={editStudentIdNumber}
                  onChange={(e) => setEditStudentIdNumber(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditReturnedItemId(null)}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveStudentInfo()}
                disabled={busyId === editReturnedItemId}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-5 py-2 text-sm font-semibold text-white hover:bg-[#a80000] disabled:opacity-50"
              >
                {busyId === editReturnedItemId ? "..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
