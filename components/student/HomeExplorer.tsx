"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { PublicItem } from "@/lib/types";

/** Student-facing pickup — always the building, not the logged sub-location. */
const STUDENT_PICKUP_AT = "Lassonde Studios";

type Props = {
  initialItems: PublicItem[];
  loadError?: string | null;
};

export function HomeExplorer({ initialItems, loadError }: Props) {
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [aiItemIds, setAiItemIds] = useState<string[] | null>(null);
  const searchCacheRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setAiItemIds(null);
      setSearchBusy(false);
      return;
    }

    const key = q.toLowerCase();
    const cached = searchCacheRef.current.get(key);
    if (cached) {
      setAiItemIds(cached);
      setSearchBusy(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await fetch("/api/items/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { itemIds?: string[] };
        if (res.ok) {
          const ids = Array.isArray(data.itemIds) ? data.itemIds : [];
          searchCacheRef.current.set(key, ids);
          setAiItemIds(ids);
        } else {
          setAiItemIds([]);
        }
      } catch {
        if (!controller.signal.aborted) setAiItemIds([]);
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, 325);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return initialItems;
    if (aiItemIds === null) return initialItems;
    const idSet = new Set(aiItemIds);
    return initialItems.filter((i) => idSet.has(i.id));
  }, [aiItemIds, initialItems, query]);

  return (
    <div className="min-h-screen bg-transparent text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-black/35 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#F5F5F0]/70">Foundit</p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#CC0000] sm:text-4xl">University of Utah</h1>
            <p className="max-w-xl text-[#F5F5F0]/65">
              Browse items turned in on campus. Higher-value items stay blurred until your description matches what we
              logged; everyday items show a clear photo.
            </p>
          </div>
          <div className="relative w-full">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#F5F5F0]/40">
              Search
            </span>
            {query.trim() && searchBusy ? (
              <span className="pointer-events-none absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 text-xs text-[#F5F5F0]/55">
                <Spinner className="h-3.5 w-3.5 text-[#CC0000]" />
                Searching...
              </span>
            ) : null}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location, or date..."
              className="w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-24 pr-28 text-[#F5F5F0] outline-none placeholder:text-[#F5F5F0]/35 focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
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
              : "No items found matching your search. Try different keywords or check back later."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenItem(item)}
                  className="group w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#CC0000]/35 hover:bg-white/[0.06]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/50">
                    <Image
                      src={`/api/items/${item.id}/blur`}
                      alt=""
                      fill
                      className={
                        item.value_tier === "high_value"
                          ? "object-cover blur-xl transition duration-300 group-hover:blur-lg"
                          : "object-cover transition duration-300"
                      }
                      sizes="(max-width: 640px) 100vw, 50vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  </div>
                  <div className="space-y-3 px-4 py-4">
                    <p className="font-medium text-[#F5F5F0]">{item.name}</p>
                    {item.value_tier === "low_value" ? (
                      <p className="rounded-xl border border-[#CC0000]/25 bg-[#CC0000]/10 px-3 py-2.5 text-sm font-medium leading-snug text-[#F5F5F0]">
                        📍 Pick up at: {STUDENT_PICKUP_AT}
                      </p>
                    ) : (
                      <p className="text-sm text-[#F5F5F0]/65">🔒 Describe to unlock — pickup location shown after you verify</p>
                    )}
                    <p className="text-xs text-[#F5F5F0]/40">Found {item.date_found}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {openItem ? <ClaimModal key={openItem.id} item={openItem} onClose={() => setOpenItem(null)} /> : null}

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
  const [showFoundPopup, setShowFoundPopup] = useState(false);
  const [matchBusy, setMatchBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentIdNumber, setStudentIdNumber] = useState("");
  const [claimSubmitted, setClaimSubmitted] = useState(false);

  async function checkMatch() {
    setError(null);
    setMatchBusy(true);
    setScore(null);
    setRevealUrl(null);
    setShowFoundPopup(false);
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
      if (data.revealUrl && data.score > 60) {
        setRevealUrl(data.revealUrl);
        setShowFoundPopup(true);
      }
    } finally {
      setMatchBusy(false);
    }
  }

  function handleNotMineGoBack() {
    setShowFoundPopup(false);
    setRevealUrl(null);
    setScore(null);
    setStudentDescription("");
    setPin("");
    setError(null);
    onClose();
  }

  async function submitClaim() {
    setError(null);
    setSubmitBusy(true);
    try {
      const name = studentName.trim();
      const studentId = studentIdNumber.trim();
      if (!name || !studentId) {
        setError("Please enter your name and student ID.");
        return;
      }

      const res = await fetch("/api/claims/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          studentDescription: item.value_tier === "low_value" ? item.name : studentDescription,
          studentName: name,
          studentIdNumber: studentId,
          pin: item.requires_pin ? pin : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Submit failed");
        return;
      }
      setShowFoundPopup(false);
      setShowClaimForm(false);
      setClaimSubmitted(true);
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        className="anim-pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="claim-title" className="text-lg font-semibold">
              {claimSubmitted ? "Claim submitted" : "Claim item"}
            </h2>
            {!claimSubmitted ? <p className="mt-0.5 text-sm text-[#F5F5F0]/55">{item.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#F5F5F0]/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        {claimSubmitted ? (
          <div className="space-y-6 px-5 py-8 text-center">
            <p className="text-base leading-relaxed text-[#F5F5F0]/85">
              Your claim has been submitted. Head to {STUDENT_PICKUP_AT} with your student ID to pick up your item.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-[10rem] items-center justify-center rounded-xl border border-[#CC0000]/45 bg-[#CC0000]/12 px-6 py-3 text-sm font-medium text-[#F5F5F0] transition hover:bg-[#CC0000]/22 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/35"
            >
              Done
            </button>
          </div>
        ) : item.value_tier === "low_value" ? (
          <div className="space-y-4 px-5 py-5">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
              <Image
                src={`/api/items/${item.id}/blur`}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 640px"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            </div>

            <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-medium text-[#F5F5F0]/90">
              📍 Pick up at: {STUDENT_PICKUP_AT}
            </p>

            {showClaimForm ? (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm text-[#F5F5F0]/80">Your name</span>
                  <input
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                    autoComplete="name"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm text-[#F5F5F0]/80">Student ID</span>
                  <input
                    value={studentIdNumber}
                    onChange={(e) => setStudentIdNumber(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
                  />
                </label>

                {item.requires_pin ? (
                  <label className="block space-y-1.5">
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
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#CC0000]/40 bg-[#CC0000]/15 py-3 text-sm font-medium text-[#F5F5F0] hover:bg-[#CC0000]/25 disabled:opacity-40"
                >
                  {submitBusy ? (
                    <>
                      <Spinner className="h-4 w-4 text-[#CC0000]" />
                      Submitting...
                    </>
                  ) : (
                    "Submit claim"
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClaimForm(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#CC0000]/40 bg-[#CC0000]/15 py-3 text-sm font-medium text-[#F5F5F0] hover:bg-[#CC0000]/25"
              >
                This is mine →
              </button>
            )}

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {score !== null ? (
              <p className="text-sm text-[#F5F5F0]/70">
                Match score: <span className="font-semibold text-[#F5F5F0]">{score}</span>
                {score > 60 ? (
                  <span className="text-emerald-400"> — strong match</span>
                ) : (
                  <span className="text-amber-300"> — need a stronger match to unlock (&gt; 60)</span>
                )}
              </p>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm text-[#F5F5F0]/80">Describe your item so we can verify it&apos;s yours</span>
              <textarea
                value={studentDescription}
                onChange={(e) => setStudentDescription(e.target.value)}
                rows={4}
                placeholder="Describe your item so we can verify it&apos;s yours"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none focus:border-[#CC0000]/45 focus:ring-2 focus:ring-[#CC0000]/25"
              />
            </label>

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
              onClick={() => void checkMatch()}
              disabled={matchBusy || !studentDescription.trim()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#CC0000]/40 bg-[#CC0000]/15 py-3 text-sm font-medium text-[#F5F5F0] hover:bg-[#CC0000]/25 disabled:opacity-40"
            >
              {matchBusy ? (
                <>
                  <Spinner className="h-4 w-4 text-[#CC0000]" />
                  Checking...
                </>
              ) : (
                "Verify description"
              )}
            </button>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>
        )}
      </div>

      {showFoundPopup && revealUrl ? (
        <div className="anim-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="anim-pop-in w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl">
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                onClick={() => setShowFoundPopup(false)}
                className="min-h-11 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#F5F5F0]/70 hover:bg-white/5"
              >
                X
              </button>
            </div>
            <div className="px-5 pb-5">
              <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10">
                <Image src={revealUrl} alt={item.name} fill className="object-cover" sizes="(max-width: 512px) 100vw, 512px" unoptimized />
              </div>
              <p className="mb-1 text-center text-2xl font-bold text-emerald-400">✓ Item Found!</p>
              <p className="text-center text-lg font-semibold text-[#F5F5F0]">{item.name}</p>
              <p className="mb-5 mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-medium text-[#F5F5F0]/90">
                📍 Pick up at: {STUDENT_PICKUP_AT}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFoundPopup(false);
                    setShowClaimForm(true);
                  }}
                  disabled={submitBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
                >
                  This is mine →
                </button>
                <button
                  type="button"
                  onClick={handleNotMineGoBack}
                  disabled={submitBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-zinc-700 py-3 text-sm font-semibold text-[#F5F5F0] transition duration-200 hover:bg-zinc-600 active:scale-[0.99] disabled:opacity-50"
                >
                  Not mine — go back
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
