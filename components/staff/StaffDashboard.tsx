"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogItemForm } from "@/components/staff/LogItemForm";
import { Spinner } from "@/components/ui/Spinner";
import type { ItemRow } from "@/lib/types";

type StaffFilter = "all" | "active" | "claimed" | "returned";

export function StaffDashboard() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [surplusCandidateId, setSurplusCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StaffFilter>("all");

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

  const visibleItems = useMemo(() => {
    switch (filter) {
      case "active":
        return items.filter((i) => !i.returned_at);
      case "claimed":
        return items.filter((i) => !i.returned_at && Boolean(i.claim_description));
      case "returned":
        return items.filter((i) => Boolean(i.returned_at));
      default:
        return items;
    }
  }, [filter, items]);

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((i) => !i.returned_at).length,
      claimed: items.filter((i) => !i.returned_at && Boolean(i.claim_description)).length,
      returned: items.filter((i) => Boolean(i.returned_at)).length,
    }),
    [items],
  );

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
      setSurplusCandidateId(null);
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
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/80 hover:bg-white/5"
            >
              Student view
            </Link>
            <Link
              href="/staff/claims"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/80 hover:bg-white/5"
            >
              Claims
            </Link>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#CC0000] px-4 py-2 text-sm font-medium text-white hover:bg-[#a80000]"
            >
              Log new item
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/80 hover:bg-white/5"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loadError ? (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </p>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2">
          {([
            ["all", `All (${counts.all})`],
            ["active", `Active (${counts.active})`],
            ["claimed", `Claimed (${counts.claimed})`],
            ["returned", `Returned (${counts.returned})`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm transition duration-200 ${
                filter === value
                  ? "border-[#CC0000]/70 bg-[#CC0000]/20 text-[#F5F5F0]"
                  : "border-white/15 text-[#F5F5F0]/80 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-[#F5F5F0]/70">
            <Spinner className="h-5 w-5 text-[#CC0000]" />
            Loading staff items...
          </div>
        ) : null}

        {!loading && visibleItems.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center text-[#F5F5F0]/55">
            No items in this filter yet.
          </p>
        ) : null}

        {!loading && visibleItems.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleItems.map((item) => {
              const returned = Boolean(item.returned_at);
              const pendingClaims = !returned && item.claim_description ? 1 : 0;
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#CC0000]/25"
                >
                  <div className="flex gap-4">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10">
                      <Image src={`/api/staff/items/${item.id}/photo`} alt="" fill className="object-cover" sizes="80px" unoptimized />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-base font-semibold text-[#F5F5F0]">{item.name}</p>
                      <p className="truncate text-sm text-[#F5F5F0]/75">{item.location}</p>
                      <p className="text-xs text-[#F5F5F0]/45">Found {item.date_found}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            returned
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/15 text-amber-200"
                          }`}
                        >
                          {returned ? "Returned" : "Active"}
                        </span>
                        {item.pin_hash ? (
                          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">PIN protected</span>
                        ) : null}
                        {pendingClaims > 0 ? (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200">
                            {pendingClaims} claim pending
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!returned ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void markReturned(item.id)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm transition duration-200 hover:bg-white/5 active:scale-[0.99] disabled:opacity-50"
                      >
                        {busyId === item.id ? "..." : "Mark as returned"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => setSurplusCandidateId(item.id)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0] transition duration-200 hover:bg-white/5 active:scale-[0.99] disabled:opacity-50"
                      >
                        {busyId === item.id ? "..." : "Send to Surplus"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </main>

      {showForm ? <LogItemForm onClose={() => setShowForm(false)} onSaved={() => void load()} /> : null}

      {surplusCandidateId ? (
        <div className="anim-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <div className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#F5F5F0]">Send to Surplus</h3>
            <p className="mt-2 text-sm text-[#F5F5F0]/75">
              Send this item to surplus? It will be removed from the active list.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSurplusCandidateId(null)}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendToSurplus(surplusCandidateId)}
                disabled={busyId === surplusCandidateId}
                className="inline-flex min-h-11 items-center rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600 disabled:opacity-50"
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
