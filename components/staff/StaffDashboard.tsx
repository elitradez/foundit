"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogItemForm } from "@/components/staff/LogItemForm";
import { Spinner } from "@/components/ui/Spinner";
import type { ItemRow } from "@/lib/types";

export function StaffDashboard() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingClaimsTotal, setPendingClaimsTotal] = useState(0);
  const [surplusCandidate, setSurplusCandidate] = useState<ItemRow | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff/items");
      const data = (await res.json().catch(() => ({}))) as {
        items?: ItemRow[];
        pendingClaimsTotal?: number;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load items");
        return;
      }
      setItems(data.items ?? []);
      setPendingClaimsTotal(data.pendingClaimsTotal ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nonSurplus = useMemo(() => items.filter((i) => i.status !== "surplus"), [items]);
  const activeItems = useMemo(() => nonSurplus.filter((i) => i.status === "active"), [nonSurplus]);

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" });
    window.location.href = "/staff/login";
  }

  async function markReturned(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/items/${id}/returned`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to update");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSendToSurplus() {
    if (!surplusCandidate) return;
    setBusyId(surplusCandidate.id);
    try {
      const res = await fetch(`/api/staff/items/${surplusCandidate.id}/surplus`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to send to surplus");
        return;
      }
      setSurplusCandidate(null);
      await load();
    } finally {
      setBusyId(null);
    }
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
              className="inline-flex min-h-12 items-center rounded-xl bg-[#CC0000] px-6 py-3 text-base font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-[#a80000]"
            >
              Log Item
            </button>
            <Link
              href="/staff/claims"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/90 hover:bg-white/5"
            >
              Claims
              {pendingClaimsTotal > 0 ? (
                <span className="rounded-full bg-[#CC0000] px-2.5 py-0.5 text-sm text-white">
                  {pendingClaimsTotal}
                </span>
              ) : null}
            </Link>
            <Link
              href="/staff/surplus"
              className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/90 hover:bg-white/5"
            >
              Surplus Log
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-3 text-base text-[#F5F5F0]/80 hover:bg-white/5"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {loadError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
            <Spinner className="h-5 w-5 text-[#CC0000]" />
            Loading items...
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[#F5F5F0]">Active items</h2>
            </div>
            {activeItems.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-base text-[#F5F5F0]/55">
                No active items yet.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-5">
                {activeItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onMarkReturned={markReturned}
                    onSendToSurplus={setSurplusCandidate}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>

      {showForm ? <LogItemForm onClose={() => setShowForm(false)} onSaved={() => void load()} /> : null}

      {surplusCandidate ? (
        <div className="anim-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
          <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
            <h3 className="text-xl font-semibold text-[#F5F5F0]">Send to Surplus</h3>
            <p className="mt-2 text-base text-[#F5F5F0]/70">
              Are you sure you want to send this item to surplus?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSurplusCandidate(null)}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-2 text-base text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSendToSurplus()}
                className="inline-flex min-h-12 items-center rounded-xl bg-[#CC0000] px-5 py-2 text-base font-medium text-white hover:bg-[#a80000]"
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

function ItemCard({
  item,
  busy,
  onMarkReturned,
  onSendToSurplus,
}: {
  item: ItemRow;
  busy: boolean;
  onMarkReturned: (id: string) => void;
  onSendToSurplus: (item: ItemRow) => void;
}) {
  const pendingClaims = item.pending_claims_count ?? 0;
  const daysOld = daysSinceFound(item.date_found);
  const canSendToSurplus = pendingClaims === 0 && daysOld >= 30;

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition duration-200 hover:border-[#CC0000]/25">
      <div className="flex gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10">
          <Image src={`/api/staff/items/${item.id}/photo`} alt="" fill className="object-cover" sizes="96px" unoptimized />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-xl font-semibold text-[#F5F5F0]">{item.name}</p>
          <p className="truncate text-base text-[#F5F5F0]/75">{item.location}</p>
          <p className="text-sm text-[#F5F5F0]/50">Found {item.date_found}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingClaims > 0 ? (
              <span className="rounded-full bg-[#CC0000]/20 px-3 py-1 text-sm text-red-100">
                {pendingClaims} pending claim{pendingClaims > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onMarkReturned(item.id)}
          className="inline-flex min-h-12 items-center rounded-xl bg-emerald-600 px-5 py-2 text-base font-semibold text-white transition duration-200 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "..." : "Returned"}
        </button>
        <button
          type="button"
          disabled={busy || !canSendToSurplus}
          onClick={() => onSendToSurplus(item)}
          className="inline-flex min-h-12 items-center rounded-xl bg-zinc-700 px-5 py-2 text-base font-semibold text-[#F5F5F0] transition duration-200 hover:bg-zinc-600 active:scale-[0.99] disabled:opacity-40"
          title={
            canSendToSurplus
              ? "Move item to Surplus & Salvage"
              : "Item must be 30+ days old with no pending claims"
          }
        >
          Surplus
        </button>
      </div>
    </li>
  );
}

function daysSinceFound(dateFound: string): number {
  const ms = Date.now() - new Date(`${dateFound}T00:00:00`).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
