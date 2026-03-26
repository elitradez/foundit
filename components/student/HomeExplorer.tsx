"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicItem } from "@/lib/types";

type Props = {
  initialItems: PublicItem[];
  loadError?: string | null;
};

export function HomeExplorer({ initialItems, loadError }: Props) {
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialItems;
    return initialItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q) ||
        i.date_found.toLowerCase().includes(q),
    );
  }, [initialItems, query]);

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-[#0c0c0c]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#F5F5F0]/70">Foundit</p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#CC0000] sm:text-4xl">University of Utah</h1>
            <p className="max-w-xl text-[#F5F5F0]/65">
              Browse items turned in on campus. Photos stay blurred until your description matches what we logged.
            </p>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#F5F5F0]/40">
              Search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location, or date…"
              className="w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-24 pr-4 text-[#F5F5F0] outline-none placeholder:text-[#F5F5F0]/35 focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
              aria-label="Search items"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {loadError ? (
          <p className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </p>
        ) : null}

        {filtered.length === 0 && !loadError ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center text-[#F5F5F0]/55">
            {initialItems.length === 0
              ? "No active items right now. Check back soon."
              : "No items match your search."}
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenItem(item)}
                  className="group w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition hover:border-[#CC0000]/35 hover:bg-white/[0.06]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/50">
                    <Image
                      src={`/api/items/${item.id}/blur`}
                      alt=""
                      fill
                      className="object-cover blur-xl transition duration-300 group-hover:blur-lg"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  </div>
                  <div className="space-y-1 px-4 py-4">
                    <p className="font-medium text-[#F5F5F0]">{item.name}</p>
                    <p className="text-sm text-[#F5F5F0]/55">{item.location}</p>
                    <p className="text-xs text-[#F5F5F0]/40">Found {item.date_found}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {openItem ? (
        <ClaimModal key={openItem.id} item={openItem} onClose={() => setOpenItem(null)} />
      ) : null}

      <footer className="border-t border-white/10 py-10 text-center text-base text-[#F5F5F0]/45">
        Staff?{" "}
        <Link
          href="/staff/login"
          className="text-base font-medium text-[#CC0000] underline decoration-[#CC0000]/40 underline-offset-4 hover:text-[#e02020] hover:decoration-[#CC0000]/70"
        >
          Sign in
        </Link>
      </footer>
    </div>
  );
}

function ClaimModal({ item, onClose }: { item: PublicItem; onClose: () => void }) {
  const [studentDescription, setStudentDescription] = useState("");
  const [pin, setPin] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [revealUrl, setRevealUrl] = useState<string | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revealed = score !== null && score > 60;

  async function checkMatch() {
    setError(null);
    setMatchBusy(true);
    setScore(null);
    setRevealUrl(null);
    try {
      const res = await fetch("/api/claims/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, studentDescription }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        score?: number;
        revealUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not verify description");
        return;
      }
      if (typeof data.score !== "number") {
        setError("Unexpected response");
        return;
      }
      setScore(data.score);
      if (data.revealUrl) setRevealUrl(data.revealUrl);
    } finally {
      setMatchBusy(false);
    }
  }

  async function submitClaim() {
    setError(null);
    setSubmitBusy(true);
    try {
      const res = await fetch("/api/claims/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          studentDescription,
          pin: item.requires_pin ? pin : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Submit failed");
        return;
      }
      onClose();
      alert("Claim submitted.");
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="claim-title" className="text-lg font-semibold">
              Claim item
            </h2>
            <p className="mt-0.5 text-sm text-[#F5F5F0]/55">{item.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm text-[#F5F5F0]/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <Image
              src={revealed && revealUrl ? revealUrl : `/api/items/${item.id}/blur`}
              alt=""
              fill
              className={`object-cover transition duration-500 ${revealed ? "blur-0" : "blur-2xl scale-105"}`}
              sizes="(max-width: 512px) 100vw, 512px"
              unoptimized
            />
            {!revealed ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 px-4 text-center text-sm text-[#F5F5F0]/80">
                Describe your item and verify to reveal the photo
              </div>
            ) : null}
          </div>

          {score !== null ? (
            <p className="text-sm text-[#F5F5F0]/70">
              Match score: <span className="font-semibold text-[#F5F5F0]">{score}</span>
              {revealed ? (
                <span className="text-emerald-400"> — strong match</span>
              ) : (
                <span className="text-amber-300"> — need a stronger match to reveal (&gt; 60)</span>
              )}
            </p>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Describe your lost item</span>
            <textarea
              value={studentDescription}
              onChange={(e) => setStudentDescription(e.target.value)}
              rows={4}
              placeholder="Color, brand, stickers, wear, what makes it yours…"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
            />
          </label>

          <button
            type="button"
            onClick={() => void checkMatch()}
            disabled={matchBusy || !studentDescription.trim()}
            className="w-full rounded-xl border border-[#CC0000]/40 bg-[#CC0000]/15 py-3 text-sm font-medium text-[#F5F5F0] hover:bg-[#CC0000]/25 disabled:opacity-40"
          >
            {matchBusy ? "Checking…" : "Verify description"}
          </button>

          {revealed ? (
            <>
              {item.requires_pin ? (
                <label className="block space-y-2">
                  <span className="text-sm text-[#F5F5F0]/80">Item PIN</span>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Provided when the item was logged"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => void submitClaim()}
                disabled={submitBusy}
                className="w-full rounded-xl bg-[#CC0000] py-3 text-sm font-medium text-white hover:bg-[#a80000] disabled:opacity-40"
              >
                {submitBusy ? "Submitting…" : "Submit claim"}
              </button>
            </>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
