"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { PublicItem } from "@/lib/types";

type Department = { id: string; name: string };

type Props = {
  initialItems: PublicItem[];
  loadError?: string | null;
  universityName?: string;
  departments?: Department[];
};

export function HomeExplorer({ initialItems, loadError, universityName = "University of Utah", departments = [] }: Props) {
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [aiItemIds, setAiItemIds] = useState<string[] | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
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
    let base = selectedDept
      ? initialItems.filter((i) => i.department_id === selectedDept)
      : initialItems;
    const q = query.trim();
    if (!q) return base;
    if (aiItemIds === null) return base;
    const idSet = new Set(aiItemIds);
    return base.filter((i) => idSet.has(i.id));
  }, [aiItemIds, initialItems, query, selectedDept]);

  return (
    <div className="min-h-screen bg-white text-[#333333]">
      {/* Nav */}
      <header className="border-b-2 border-[#CC0000] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#CC0000]">{universityName}</p>
            <p className="text-base font-bold leading-tight text-[#333333]">Lost &amp; Found</p>
          </div>
          <Link
            href="/staff/login"
            className="text-sm font-medium text-[#CC0000] underline-offset-2 hover:underline"
          >
            Staff sign in
          </Link>
        </div>
      </header>

      {/* Hero / search */}
      <div className="border-b border-[#E5E5E5] bg-[#F5F5F5]">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="mb-6 space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-[#333333] sm:text-4xl">
              Find a lost item
            </h1>
            <p className="max-w-xl text-sm text-[#555555]">
              Search for lost items found across campus. Higher-value items require ownership verification before pickup.
            </p>
          </div>
          <div className="relative w-full">
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#999999] text-sm">
              🔍
            </span>
            {query.trim() && searchBusy ? (
              <span className="pointer-events-none absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 text-xs text-[#777777]">
                <Spinner className="h-3.5 w-3.5 text-[#CC0000]" />
                Searching...
              </span>
            ) : null}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location, or date..."
              className="w-full rounded-[4px] border border-[#E5E5E5] bg-white py-3 pl-10 pr-28 text-[#333333] outline-none placeholder:text-[#AAAAAA] focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
              aria-label="Search items"
            />
          </div>
        </div>
      </div>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">
        {/* Department tabs */}
        {departments.length > 0 ? (
          <div className="mb-6 flex flex-wrap gap-0 border-b border-[#E5E5E5]">
            <button
              type="button"
              onClick={() => setSelectedDept(null)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                selectedDept === null
                  ? "border-[#CC0000] font-semibold text-[#CC0000]"
                  : "border-transparent text-[#555555] hover:text-[#333333]"
              }`}
            >
              All
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDept(d.id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                  selectedDept === d.id
                    ? "border-[#CC0000] font-semibold text-[#CC0000]"
                    : "border-transparent text-[#555555] hover:text-[#333333]"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        ) : null}

        {loadError ? (
          <p className="mb-8 rounded-[4px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadError}
          </p>
        ) : null}

        {filtered.length === 0 && !loadError ? (
          <p className="rounded-[4px] border border-[#E5E5E5] bg-[#F5F5F5] px-6 py-16 text-center text-[#777777]">
            {selectedDept && !query.trim()
              ? "No items logged yet at this location."
              : initialItems.length === 0
              ? "No active items right now. Check back soon."
              : "No items found matching your search. Try different keywords or check back later."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenItem(item)}
                  aria-label={`Claim ${item.name}`}
                  className="group w-full overflow-hidden rounded-[4px] border border-[#E5E5E5] bg-white text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#CC0000]/40 hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5]">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                  <div className="space-y-2.5 px-4 py-4">
                    <p className="font-semibold text-[#333333]">{item.name}</p>
                    {item.value_tier === "low_value" ? (
                      <p className="rounded-[4px] border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-2 text-sm text-[#555555]">
                        <span aria-hidden="true">📍 </span>Pick up at: {item.department_name ?? "Lost & Found"}
                      </p>
                    ) : (
                      <p className="text-sm text-[#777777]"><span aria-hidden="true">🔒 </span>Describe to unlock — pickup location shown after you verify</p>
                    )}
                    <p className="text-xs text-[#999999]">Found {item.date_found}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {openItem ? <ClaimModal key={openItem.id} item={openItem} onClose={() => setOpenItem(null)} departmentName={openItem.department_name ?? "Lost & Found"} /> : null}

      <footer className="border-t border-[#E5E5E5] bg-white py-8 text-center text-sm text-[#999999]">
        {universityName} Lost &amp; Found &nbsp;·&nbsp;{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-[#555555] transition">
          Privacy
        </Link>
      </footer>
    </div>
  );
}

function ClaimModal({ item, onClose, departmentName }: { item: PublicItem; onClose: () => void; departmentName: string }) {
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
    <div className="anim-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        className="anim-pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[4px] border border-[#E5E5E5] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E5E5] px-5 py-4">
          <div>
            <h2 id="claim-title" className="text-lg font-bold text-[#333333]">
              {claimSubmitted ? "Claim submitted" : "Claim item"}
            </h2>
            {!claimSubmitted ? <p className="mt-0.5 text-sm text-[#777777]">{item.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-[4px] border border-[#E5E5E5] px-3 py-2 text-sm text-[#555555] hover:bg-[#F5F5F5]"
          >
            Close
          </button>
        </div>

        {claimSubmitted ? (
          <div className="space-y-6 px-5 py-8 text-center">
            <p className="text-base leading-relaxed text-[#333333]">
              Your claim has been submitted. Head to {departmentName} with your student ID to pick up your item.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-[10rem] items-center justify-center rounded-[4px] bg-[#CC0000] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#A80000] focus:outline-none focus:ring-2 focus:ring-[#CC0000]/40"
            >
              Done
            </button>
          </div>
        ) : item.value_tier === "low_value" ? (
          <div className="space-y-4 px-5 py-5">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[4px] border border-[#E5E5E5] bg-[#F5F5F5]">
              <Image
                src={`/api/items/${item.id}/blur`}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 640px"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
            </div>

            <p className="rounded-[4px] border border-[#E5E5E5] bg-[#F5F5F5] px-4 py-3 text-sm font-medium text-[#333333]">
              <span aria-hidden="true">📍 </span>Pick up at: {departmentName}
            </p>

            {showClaimForm ? (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-[#333333]">Your name</span>
                  <input
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full rounded-[4px] border border-[#E5E5E5] bg-white px-4 py-3 text-[#333333] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
                    autoComplete="name"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-[#333333]">Student ID</span>
                  <input
                    value={studentIdNumber}
                    onChange={(e) => setStudentIdNumber(e.target.value)}
                    className="w-full rounded-[4px] border border-[#E5E5E5] bg-white px-4 py-3 text-[#333333] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
                  />
                </label>

                {item.requires_pin ? (
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-[#333333]">Item PIN</span>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Provided when the item was logged"
                      className="w-full rounded-[4px] border border-[#E5E5E5] bg-white px-4 py-3 text-[#333333] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
                    />
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => void submitClaim()}
                  disabled={submitBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[#CC0000] py-3 text-sm font-semibold text-white transition hover:bg-[#A80000] disabled:opacity-40"
                >
                  {submitBusy ? (
                    <>
                      <Spinner className="h-4 w-4 text-white" />
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
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[4px] bg-[#CC0000] py-3 text-sm font-semibold text-white transition hover:bg-[#A80000]"
              >
                This is mine →
              </button>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {score !== null ? (
              <p className="text-sm text-[#555555]">
                Match score: <span className="font-semibold text-[#333333]">{score}</span>
                {score > 60 ? (
                  <span className="text-emerald-600"> — strong match</span>
                ) : (
                  <span className="text-amber-600"> — need a stronger match to unlock (&gt; 60)</span>
                )}
              </p>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#333333]">Describe your item so we can verify it&apos;s yours</span>
              <textarea
                value={studentDescription}
                onChange={(e) => setStudentDescription(e.target.value)}
                rows={4}
                placeholder="Describe your item so we can verify it&apos;s yours"
                className="w-full rounded-[4px] border border-[#E5E5E5] bg-white px-4 py-3 text-[#333333] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
              />
            </label>

            {item.requires_pin ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#333333]">Item PIN</span>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Provided when the item was logged"
                  className="w-full rounded-[4px] border border-[#E5E5E5] bg-white px-4 py-3 text-[#333333] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={() => void checkMatch()}
              disabled={matchBusy || !studentDescription.trim()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[#CC0000] py-3 text-sm font-semibold text-white transition hover:bg-[#A80000] disabled:opacity-40"
            >
              {matchBusy ? (
                <>
                  <Spinner className="h-4 w-4 text-white" />
                  Checking...
                </>
              ) : (
                "Verify description"
              )}
            </button>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        )}
      </div>

      {showFoundPopup && revealUrl ? (
        <div className="anim-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="found-popup-title"
            className="anim-pop-in w-full max-w-md overflow-hidden rounded-[4px] border border-[#E5E5E5] bg-white shadow-2xl"
          >
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                onClick={() => setShowFoundPopup(false)}
                aria-label="Close"
                className="min-h-11 rounded-[4px] border border-[#E5E5E5] px-3 py-2 text-sm text-[#555555] hover:bg-[#F5F5F5]"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="px-5 pb-5">
              <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-[4px] border border-[#E5E5E5]">
                <Image src={revealUrl} alt={item.name} fill className="object-cover" sizes="(max-width: 512px) 100vw, 512px" unoptimized />
              </div>
              <p id="found-popup-title" className="mb-1 text-center text-2xl font-bold text-emerald-600"><span aria-hidden="true">✓ </span>Item Found!</p>
              <p className="text-center text-lg font-semibold text-[#333333]">{item.name}</p>
              <p className="mb-5 mt-4 rounded-[4px] border border-[#E5E5E5] bg-[#F5F5F5] p-3 text-sm font-medium text-[#333333]">
                <span aria-hidden="true">📍 </span>Pick up at: {departmentName}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFoundPopup(false);
                    setShowClaimForm(true);
                  }}
                  disabled={submitBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
                >
                  This is mine →
                </button>
                <button
                  type="button"
                  onClick={handleNotMineGoBack}
                  disabled={submitBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[4px] border border-[#E5E5E5] bg-white py-3 text-sm font-semibold text-[#333333] transition hover:bg-[#F5F5F5] active:scale-[0.99] disabled:opacity-50"
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
