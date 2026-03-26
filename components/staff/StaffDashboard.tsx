"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogItemForm } from "@/components/staff/LogItemForm";
import type { ItemRow } from "@/lib/types";
import { publicItemPhotoUrl } from "@/lib/storage-url";

export function StaffDashboard() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/staff/items");
    const data = (await res.json().catch(() => ({}))) as { items?: ItemRow[]; error?: string };
    if (!res.ok) {
      setLoadError(data.error ?? "Could not load items");
      return;
    }
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-xl font-semibold">Foundit dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/80 hover:bg-white/5"
            >
              Student view
            </Link>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-[#CC0000] px-4 py-2 text-sm font-medium text-white hover:bg-[#a80000]"
            >
              Log new item
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/80 hover:bg-white/5"
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

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
              <tr>
                <th className="px-4 py-3 font-medium">Photo</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">PIN</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Claim</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.length === 0 && !loadError ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                    No items yet. Log your first find.
                  </td>
                </tr>
              ) : null}
              {items.map((item) => {
                const url = publicItemPhotoUrl(item.photo_path);
                const returned = Boolean(item.returned_at);
                return (
                  <tr key={item.id} className="bg-black/20">
                    <td className="px-4 py-3">
                      <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                        {url ? (
                          <Image src={url} alt="" fill className="object-cover" sizes="56px" unoptimized />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.location}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.date_found}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.pin_hash ? "Yes" : "—"}</td>
                    <td className="px-4 py-3">
                      {returned ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                          Returned
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-xs text-[#F5F5F0]/60">
                      {item.claim_description ? (
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-200">
                          Submitted
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!returned ? (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void markReturned(item.id)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
                        >
                          {busyId === item.id ? "…" : "Mark returned"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {showForm ? <LogItemForm onClose={() => setShowForm(false)} onSaved={() => void load()} /> : null}
    </div>
  );
}
