"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Spinner } from "@/components/ui/Spinner";
import { WelcomeModal } from "@/components/student/WelcomeModal";
import type { PublicItem } from "@/lib/types";

type Department = { id: string; name: string };

type Props = {
  initialItems: PublicItem[];
  loadError?: string | null;
  universityName?: string;
  brandColor?: string;
  brandColorHover?: string;
  departments?: Department[];
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const PAGE_SIZE = 24;

export function HomeExplorer({ initialItems, loadError, universityName = "University of Utah", brandColor = "#CC0000", brandColorHover = "#a80000", departments = [] }: Props) {
  // Welcome popup shows on every entry to the student home page. Intentionally
  // not persisted: no flag, field, or storage tracks whether it has been seen.
  const [showWelcome, setShowWelcome] = useState(true);
  const [allItems, setAllItems] = useState<PublicItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === 500);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [aiItemIds, setAiItemIds] = useState<string[] | null>(null);
  // Server-reported count of CLOSE matches; 0 with results means the grid is
  // showing best-effort neighbours, which the UI labels honestly.
  const [strongCount, setStrongCount] = useState<number | null>(null);
  // WHICH result ids are close matches. The grid shows only these by default;
  // the weak tail collapses behind a "show similar items" toggle so vague
  // queries stay clean even with hundreds of items in the catalog.
  const [strongIds, setStrongIds] = useState<string[] | null>(null);
  const [showWeak, setShowWeak] = useState(false);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchCacheRef = useRef<Map<string, { ids: string[]; strong: number | null; strongIds: string[] | null }>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/items/public?offset=${allItems.length}`);
      const data = (await res.json().catch(() => ({}))) as { items?: PublicItem[] };
      if (res.ok && Array.isArray(data.items)) {
        setAllItems((prev) => [...prev, ...data.items!]);
        if (data.items.length < 500) setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allItems) {
      if (item.department_id) {
        counts.set(item.department_id, (counts.get(item.department_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [allItems]);

  useEffect(() => {
    const q = query.trim();
    setShowWeak(false);
    if (!q) {
      setAiItemIds(null);
      setStrongCount(null);
      setStrongIds(null);
      setSearchBusy(false);
      return;
    }

    const key = q.toLowerCase();
    const cached = searchCacheRef.current.get(key);
    if (cached) {
      setAiItemIds(cached.ids);
      setStrongCount(cached.strong);
      setStrongIds(cached.strongIds);
      setSearchBusy(false);
      return;
    }

    // Clear the previous query's AI results so the grid falls back to the
    // instant local filter for THIS query while the new request is in flight,
    // instead of showing stale matches from the prior query.
    setAiItemIds(null);
    setStrongCount(null);
    setStrongIds(null);
    // Mark "searching" from the keystroke (not just once the fetch fires after
    // the debounce), so the empty state stays suppressed and the progress
    // indicator shows during the whole debounce + request window.
    setSearchBusy(true);

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/items/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { itemIds?: string[]; strongCount?: number; strongIds?: string[] };
        if (res.ok) {
          const ids = Array.isArray(data.itemIds) ? data.itemIds : [];
          const strong = typeof data.strongCount === "number" ? data.strongCount : null;
          const strongList = Array.isArray(data.strongIds) ? data.strongIds : null;
          searchCacheRef.current.set(key, { ids, strong, strongIds: strongList });
          setAiItemIds(ids);
          setStrongCount(strong);
          setStrongIds(strongList);
        } else {
          // Search service unavailable (rate limit, outage): fall back to the
          // instant local filter rather than blanking the grid.
          setAiItemIds(null);
        }
      } catch {
        if (!controller.signal.aborted) setAiItemIds(null);
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, 325);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, selectedDept]);

  // Instant client-side narrowing on the fields available in the public
  // payload (name, location, department, date). This is what the user sees
  // immediately on each keystroke; the AI semantic results replace it as soon
  // as they arrive (they catch matches like "water bottle" → "Hydro Flask"
  // that plain text matching cannot).
  const localMatchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    // Drop 1-char tokens: they'd match almost every item (and the date string)
    // and make the instant grid noise. The AI request still gets the full query.
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return null;
    // Match on ANY word (not all), ranked by how many words hit, so a vague
    // multi-word query like "blue water bottle" instantly surfaces every
    // water bottle — including a teal one — instead of demanding an exact
    // phrase match. The AI semantic result replaces this as soon as it lands.
    return allItems
      .map((i) => {
        const hay = `${i.name} ${i.location} ${i.department_name ?? ""} ${i.date_found}`.toLowerCase();
        const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        return { id: i.id, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.id);
  }, [allItems, query]);

  const filtered = useMemo(() => {
    const base = selectedDept
      ? allItems.filter((i) => i.department_id === selectedDept)
      : allItems;
    const q = query.trim();
    if (!q) return base;
    // Prefer AI results; while they're pending (or the service is down) use
    // the instant local match so typing always visibly narrows the grid.
    const ids = aiItemIds ?? localMatchIds;
    if (ids === null) return base;
    const order = new Map(ids.map((id, idx) => [id, idx]));
    return base
      .filter((i) => order.has(i.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [aiItemIds, localMatchIds, allItems, query, selectedDept]);

  // Split search results into close matches and the weak best-effort tail.
  // Default view shows only close matches; the tail sits behind a toggle.
  // When there are NO close matches, show the whole tail under the existing
  // "no close matches" notice (an empty grid would be a dead end).
  const { strongItems, weakItems } = useMemo(() => {
    if (!query.trim() || aiItemIds === null || strongIds === null || strongIds.length === 0) {
      return { strongItems: filtered, weakItems: [] as PublicItem[] };
    }
    const strongSet = new Set(strongIds);
    return {
      strongItems: filtered.filter((i) => strongSet.has(i.id)),
      weakItems: filtered.filter((i) => !strongSet.has(i.id)),
    };
  }, [filtered, query, aiItemIds, strongIds]);

  const displayItems = showWeak ? [...strongItems, ...weakItems] : strongItems;
  const visibleItems = displayItems.slice(0, visibleCount);

  function closeWelcome() {
    setShowWelcome(false);
    // Move the student into the items/search view by focusing search after the
    // modal unmounts and focus is restored.
    setTimeout(() => document.getElementById("item-search")?.focus(), 0);
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", fontFamily: FONT, color: "#333333" }}>

      {showWelcome ? (
        <WelcomeModal
          universityName={universityName}
          brandColor={brandColor}
          brandColorHover={brandColorHover}
          onClose={closeWelcome}
        />
      ) : null}

      {/* ── Nav ── */}
      <header style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E5" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ color: "#CC0000", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1.3, margin: 0 }}>
              {universityName}
            </p>
            <p style={{ color: "#1a1a1a", fontSize: 18, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
              Lost &amp; Found
            </p>
          </div>
          <nav aria-label="Site">
            <Link
              href="/staff/login"
              style={{ color: "#CC0000", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Staff sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Search / hero ── */}
      <section aria-label="Search lost items" style={{ backgroundColor: "#F5F5F5", borderBottom: "1px solid #E5E5E5" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "24px 16px" }}>
          <h1 style={{ color: "#1a1a1a", fontSize: 28, fontWeight: 600, margin: "0 0 16px 0" }}>
            Lost something?
          </h1>
          <div style={{ position: "relative" }}>
            {query.trim() && searchBusy ? (
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 5, pointerEvents: "none" }}>
                <span className="uu-dot uu-dot-1" />
                <span className="uu-dot uu-dot-2" />
                <span className="uu-dot uu-dot-3" />
              </span>
            ) : null}
            <input
              id="item-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location, or date…"
              aria-label="Search items"
              style={{ width: "100%", boxSizing: "border-box", backgroundColor: "#FFFFFF", border: "1px solid #CCCCCC", borderRadius: 8, padding: "10px 16px", fontSize: 14, color: "#333333" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#CCCCCC"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>
      </section>

      {/* ── Main ── */}
      <main id="main-content" style={{ maxWidth: 1152, margin: "0 auto", padding: "0 16px 48px" }}>

        {/* Search progress bar */}
        {searchBusy ? (
          <div className="uu-progress-track" style={{ marginBottom: 0 }}>
            <div className="uu-progress-bar" />
          </div>
        ) : null}

        {/* Announce search progress and result counts — the progress bar and
            grid changes are visual-only. Mounted container so the text swap
            is reliably announced. */}
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim()
            ? searchBusy
              ? "Searching…"
              : `${displayItems.length} ${displayItems.length === 1 ? "item" : "items"} found`
            : ""}
        </p>

        {/* Department tabs — APG pattern, manual activation: only the selected
            tab is in the Tab order; Left/Right/Home/End move focus. */}
        {departments.length > 0 ? (
          <div role="tablist" aria-label="Filter by location" style={{ overflowX: "auto", whiteSpace: "nowrap", borderBottom: "1px solid #E5E5E5", marginBottom: 24 }}>
            {[{ id: null, name: "All", count: allItems.length }, ...departments.map((d) => ({ id: d.id, name: d.name, count: deptCounts.get(d.id) ?? 0 }))].map((tab) => {
              const active = selectedDept === tab.id;
              const tabIds: (string | null)[] = [null, ...departments.map((d) => d.id)];
              return (
                <button
                  key={tab.id ?? "__all"}
                  role="tab"
                  id={`dept-tab-${tab.id ?? "all"}`}
                  aria-selected={active}
                  aria-controls="items-tabpanel"
                  type="button"
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    const idx = tabIds.indexOf(tab.id);
                    let next: string | null;
                    if (e.key === "ArrowRight") next = tabIds[(idx + 1) % tabIds.length];
                    else if (e.key === "ArrowLeft") next = tabIds[(idx - 1 + tabIds.length) % tabIds.length];
                    else if (e.key === "Home") next = tabIds[0];
                    else if (e.key === "End") next = tabIds[tabIds.length - 1];
                    else return;
                    e.preventDefault();
                    document.getElementById(`dept-tab-${next ?? "all"}`)?.focus();
                  }}
                  onClick={() => setSelectedDept(tab.id)}
                  style={{
                    display: "inline-block",
                    padding: "12px 16px",
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? "#CC0000" : "#666666",
                    background: "none",
                    border: "none",
                    borderBottom: active ? "2px solid #CC0000" : "2px solid transparent",
                    marginBottom: -1,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                >
                  {tab.name}{" "}
                  <span style={{ color: active ? "#CC0000" : "#666666", fontWeight: 400 }}>({tab.count})</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {loadError ? (
          <p style={{ marginBottom: 24, padding: "12px 16px", border: "1px solid #FDE68A", backgroundColor: "#FFFBEB", borderRadius: 6, fontSize: 14, color: "#92400E" }}>
            {loadError}
          </p>
        ) : null}

        {/* Honest weak-results signal: ranked neighbours are shown, but the
            student should know nothing matched closely — "it isn't here" is
            actionable in a lost & found. */}
        {query.trim() && !searchBusy && aiItemIds !== null && aiItemIds.length > 0 && strongCount === 0 ? (
          <p role="status" style={{ margin: "16px 0", padding: "12px 16px", border: "1px solid #E5E5E5", backgroundColor: "#F5F5F5", borderRadius: 6, fontSize: 14, color: "#555555" }}>
            No close matches for “{query.trim()}” — showing similar items below. Try adding more detail to your search.
          </p>
        ) : null}

        {/* The tab panel: the item grid region the department tabs control. */}
        <div role="tabpanel" id="items-tabpanel" aria-labelledby={`dept-tab-${selectedDept ?? "all"}`} tabIndex={0}>
        {/* Empty state — suppressed while a search is in flight so a vague
            query never flashes "No items found" before AI results land. */}
        {filtered.length === 0 && !loadError && !searchBusy ? (
          <div style={{ textAlign: "center", padding: "64px 24px" }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>📭</p>
            <p style={{ fontSize: 14, color: "#666666" }}>
              {selectedDept && !query.trim()
                ? "No items found at this location."
                : allItems.length === 0
                ? "No active items right now. Check back soon."
                : "No items found matching your search."}
            </p>
          </div>
        ) : (
          <>
            <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, listStyle: "none", padding: 0, margin: 0 }}>
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} onClick={() => setOpenItem(item)} />
                </li>
              ))}
            </ul>
            {visibleCount < displayItems.length ? (
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E5E5E5",
                    borderRadius: 6,
                    padding: "10px 28px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#333333",
                    cursor: "pointer",
                  }}
                >
                  Load more
                </button>
              </div>
            ) : null}
            {!showWeak && weakItems.length > 0 && visibleCount >= displayItems.length ? (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setShowWeak(true)}
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E5E5E5",
                    borderRadius: 6,
                    padding: "10px 28px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#666666",
                    cursor: "pointer",
                  }}
                >
                  Show {weakItems.length} similar item{weakItems.length === 1 ? "" : "s"}
                </button>
              </div>
            ) : null}
            {hasMore && !query.trim() && visibleCount >= displayItems.length ? (
              loadingMore ? (
                <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, listStyle: "none", padding: 0, margin: "20px 0 0" }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i}><div className="uu-skeleton-card" /></li>
                  ))}
                </ul>
              ) : (
                <div style={{ textAlign: "center", marginTop: 32 }}>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    style={{
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #E5E5E5",
                      borderRadius: 6,
                      padding: "10px 28px",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333333",
                      cursor: "pointer",
                    }}
                  >
                    Load more
                  </button>
                </div>
              )
            ) : null}
          </>
        )}
        </div>
      </main>

      {openItem ? (
        <ClaimModal
          key={openItem.id}
          item={openItem}
          onClose={() => setOpenItem(null)}
          departmentName={openItem.department_name ?? "Lost & Found"}
          onSubmitted={() => showToast("Claim submitted — we’ll contact you shortly.")}
        />
      ) : null}

      {/* Toast — container stays mounted so screen readers announce the text */}
      <div
        role="status"
        aria-live="polite"
        style={{ position: "fixed", bottom: 24, left: 0, right: 0, zIndex: 100, display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 16px" }}
      >
        {toast ? (
          <div
            className="anim-pop-in"
            style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#1a1a1a", color: "#FFFFFF", padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxWidth: "100%" }}
          >
            <span aria-hidden="true" style={{ color: "#4ADE80", fontWeight: 700 }}>✓</span>
            {toast}
          </div>
        ) : null}
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #E5E5E5", backgroundColor: "#FFFFFF", padding: "24px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#666666", margin: 0 }}>
          {universityName} Lost &amp; Found &nbsp;·&nbsp;{" "}
          <Link
            href="/privacy"
            style={{ color: "#CC0000", textDecoration: "underline" }}
          >
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

function ItemCard({ item, onClick }: { item: PublicItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${item.name}, ${item.department_name ?? "Lost & Found"}, found ${item.date_found} — claim this item`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        textAlign: "left",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E5",
        borderRadius: 8,
        boxShadow: hovered ? "0 4px 12px rgba(0,0,0,0.12)" : "0 1px 4px rgba(0,0,0,0.08)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "box-shadow 0.15s, transform 0.15s",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      {/* Photo */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5", overflow: "hidden" }}>
        <Image
          src={`/api/items/${item.id}/blur`}
          alt=""
          fill
          className="object-cover blur-xl"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      </div>

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 16px 16px" }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px 0" }}>{item.name}</p>
        <p style={{ fontSize: 12, color: "#CC0000", margin: "0 0 4px 0" }}>
          {item.department_name ?? "Lost & Found"}
        </p>
        <p style={{ fontSize: 12, color: "#666666", margin: "0 0 14px 0" }}>Found {item.date_found}</p>

        {/* CTA */}
        <div
          style={{
            marginTop: "auto",
            backgroundColor: hovered ? "#A80000" : "#CC0000",
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
            padding: "9px 0",
            borderRadius: 4,
            transition: "background-color 0.15s",
          }}
        >
          Claim this item
        </div>
      </div>
    </button>
  );
}

type ModalStep = 1 | 2 | 3 | 4;

export function ClaimModal({
  item,
  onClose,
  departmentName,
  onSubmitted,
  initialStep = 1,
  committedDescription,
  findRequestId,
}: {
  item: Pick<PublicItem, "id" | "name">;
  onClose: () => void;
  departmentName: string;
  onSubmitted: () => void;
  // The describe-first flow enters directly at the contact step (its match
  // check already happened server-side) with the description the student
  // committed before seeing any photos.
  initialStep?: ModalStep;
  committedDescription?: string;
  findRequestId?: string;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [step, setStep] = useState<ModalStep>(initialStep);
  const [studentDescription, setStudentDescription] = useState(committedDescription ?? "");
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [revealUrl, setRevealUrl] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);

  const nameError = nameTouched && !studentName.trim();
  const contactError = contactTouched && !email.trim() && !phoneNumber.trim();
  const canSubmit = studentName.trim().length > 0 && (email.trim().length > 0 || phoneNumber.trim().length > 0);

  // Each step swap unmounts the element that had focus, which would drop focus
  // to <body> (breaking Tab order and giving screen-reader users no cue). Move
  // focus to a meaningful element in the new step. Focusing the step-4 heading
  // announces "You're all set" inside the dialog, which the aria-modal would
  // otherwise suppress for an outside-the-dialog toast.
  useEffect(() => {
    if (step === 2) document.getElementById("claim-match-result")?.focus();
    if (step === 3) document.getElementById("claim-name")?.focus();
    if (step === 4) document.getElementById("claim-title")?.focus();
  }, [step]);

  async function checkMatch() {
    setError(null);
    setMatchBusy(true);
    try {
      const res = await fetch("/api/claims/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, studentDescription }),
      });
      const data = (await res.json().catch(() => ({}))) as { score?: number; revealUrl?: string | null; error?: string };
      if (!res.ok) { setError(data.error ?? "Check failed"); return; }
      setMatchScore(data.score ?? 0);
      setRevealUrl(data.revealUrl ?? null);
      setStep(2);
    } catch {
      setError("Couldn’t reach the server — please check your connection and try again.");
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
          studentDescription: studentDescription || undefined,
          studentName: studentName || undefined,
          studentEmail: email || undefined,
          phoneNumber: phoneNumber || undefined,
          findRequestId: findRequestId || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? "Submit failed"); return; }
      onSubmitted();
      setStep(4);
    } catch {
      setError("Couldn’t reach the server — your claim was NOT submitted. Please try again.");
    } finally {
      setSubmitBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "#FFFFFF",
    border: "1px solid #E5E5E5",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 14,
    color: "#333333",
    fontFamily: FONT,
  };

  const primaryBtn: React.CSSProperties = {
    display: "inline-flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    backgroundColor: "#CC0000",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: FONT,
  };

  const secondaryBtn: React.CSSProperties = {
    display: "inline-flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    color: "#333333",
    fontSize: 14,
    fontWeight: 500,
    border: "1px solid #E5E5E5",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: FONT,
  };

  const explainerSteps = [
    { n: 1, title: "Submit a claim", sub: "Tell us what the item looks like" },
    { n: 2, title: `Head to ${departmentName}`, sub: "Bring your ID" },
    { n: 3, title: "Describe it to staff", sub: "They\u2019ll hand it over if it matches" },
  ];

  const isMatch = matchScore !== null && matchScore > 60;

  return (
    <div
      className="anim-fade-in"
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitBusy) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        className="anim-pop-in sm:items-center"
        style={{ maxHeight: "92vh", width: "100%", maxWidth: 512, overflowY: "auto", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", fontFamily: FONT }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #E5E5E5", padding: "16px 20px" }}>
          <div>
            <h2 id="claim-title" tabIndex={-1} style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: 0, outline: "none" }}>
              {step === 4 ? "You\u2019re all set \u2713" : "Claim item"}
            </h2>
            {step !== 4 ? <p style={{ marginTop: 2, fontSize: 13, color: "#555555" }}>{item.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitBusy}
            style={{ minHeight: 36, padding: "6px 14px", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 4, fontSize: 13, color: "#555555", cursor: submitBusy ? "not-allowed" : "pointer", opacity: submitBusy ? 0.5 : 1, fontFamily: FONT }}
          >
            Close
          </button>
        </div>

        {/* Busy-state announcements — the visual button-text swaps happen on
            the focused element and are not read by screen readers. */}
        <p className="sr-only" role="status">
          {matchBusy ? "Checking your description…" : submitBusy ? "Submitting your claim…" : ""}
        </p>

        {/* ── Step 1: Describe your item ── */}
        {step === 1 ? (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 3-step explainer */}
            <div style={{ backgroundColor: "#F5F5F5", borderRadius: 8, padding: "14px 12px", display: "flex", alignItems: "flex-start", gap: 6 }}>
              {explainerSteps.map((s) => (
                <div key={s.n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#CC0000", color: "#FFFFFF", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6, flexShrink: 0 }}>
                    {s.n}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", margin: "0 0 2px", lineHeight: 1.3 }}>{s.title}</p>
                  <p style={{ fontSize: 10, color: "#666666", margin: 0, lineHeight: 1.3 }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Description textarea */}
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 4 }}>
                Describe your item
              </span>
              <p style={{ fontSize: 12, color: "#666666", margin: "0 0 8px" }}>
                Color, brand, any damage, what&apos;s inside — anything that proves it&apos;s yours
              </p>
              <textarea
                value={studentDescription}
                onChange={(e) => setStudentDescription(e.target.value)}
                rows={4}
                placeholder="e.g. Dark green Hydro Flask, dent on the side, black lid, 'Emma' written in marker on the bottom"
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </label>

            <button
              type="button"
              onClick={() => void checkMatch()}
              disabled={matchBusy || studentDescription.trim().length < 20}
              style={{ ...primaryBtn, opacity: (matchBusy || studentDescription.trim().length < 20) ? 0.5 : 1, cursor: (matchBusy || studentDescription.trim().length < 20) ? "not-allowed" : "pointer" }}
            >
              {matchBusy ? <><Spinner className="h-4 w-4" style={{ color: "#fff" }} /> Checking your description…</> : "Check if it\u2019s mine \u2192"}
            </button>

            {error ? <p role="alert" style={{ fontSize: 13, color: "#CC0000", margin: 0 }}>{error}</p> : null}
          </div>
        ) : null}

        {/* ── Step 2: Match result ── */}
        {step === 2 ? (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Revealed / blurred image */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5", borderRadius: 8, overflow: "hidden" }}>
              <Image
                src={isMatch && revealUrl ? revealUrl : `/api/items/${item.id}/blur`}
                alt={isMatch && revealUrl ? `Photo of ${item.name}` : ""}
                fill
                className={isMatch && revealUrl ? "object-cover" : "object-cover blur-xl"}
                sizes="512px"
                unoptimized
              />
            </div>

            {isMatch ? (
              <>
                <p id="claim-match-result" tabIndex={-1} style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: 0, outline: "none" }}>
                  Looks like a match — is this your item?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={() => setStep(3)} style={primaryBtn}>
                    Yes, this is mine
                  </button>
                  <button type="button" onClick={onClose} style={secondaryBtn}>
                    Not mine
                  </button>
                </div>
              </>
            ) : (
              <>
                <p id="claim-match-result" tabIndex={-1} style={{ fontSize: 14, color: "#555555", lineHeight: 1.6, margin: 0, outline: "none" }}>
                  We couldn&apos;t verify from your description alone. You can add more detail and try again, or submit a claim and staff will verify in person when you come to pick it up.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" onClick={() => setStep(1)} style={secondaryBtn}>
                    Try again
                  </button>
                  <button type="button" onClick={() => setStep(3)} style={primaryBtn}>
                    Submit anyway
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* ── Step 3: Contact details ── */}
        {step === 3 ? (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "#555555", margin: 0, padding: "10px 12px", backgroundColor: "#F5F5F5", borderRadius: 6 }}>
              Staff will verify your description when you come to pick it up.
            </p>

            {/* Name */}
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>
                Full name <span style={{ color: "#CC0000" }}>*</span>
              </span>
              <input
                id="claim-name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                style={{ ...inputStyle, borderColor: nameError ? "#CC0000" : "#E5E5E5" }}
                autoComplete="name"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "claim-name-error" : undefined}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                onBlur={(e) => { setNameTouched(true); e.currentTarget.style.borderColor = nameError ? "#CC0000" : "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {nameError ? <p id="claim-name-error" role="alert" style={{ fontSize: 12, color: "#CC0000", margin: "4px 0 0" }}>Name is required</p> : null}
            </label>

            {/* Email + Phone — at least one required */}
            <div>
              <p style={{ fontSize: 12, color: "#666666", margin: "0 0 10px" }}>
                Provide at least one way to reach you <span style={{ color: "#CC0000" }}>*</span>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>
                    Email address
                  </span>
                  <input
                    id="claim-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    style={{ ...inputStyle, borderColor: contactError ? "#CC0000" : "#E5E5E5" }}
                    autoComplete="email"
                    aria-invalid={Boolean(contactError)}
                    aria-describedby={contactError ? "claim-contact-error" : undefined}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                    onBlur={(e) => { setContactTouched(true); e.currentTarget.style.borderColor = contactError ? "#CC0000" : "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>
                    Phone number
                  </span>
                  <input
                    id="claim-phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    style={{ ...inputStyle, borderColor: contactError ? "#CC0000" : "#E5E5E5" }}
                    autoComplete="tel"
                    aria-invalid={Boolean(contactError)}
                    aria-describedby={contactError ? "claim-contact-error" : undefined}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                    onBlur={(e) => { setContactTouched(true); e.currentTarget.style.borderColor = contactError ? "#CC0000" : "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </label>
              </div>
              {contactError ? <p id="claim-contact-error" role="alert" style={{ fontSize: 12, color: "#CC0000", margin: "4px 0 0" }}>Please provide an email or phone number</p> : null}
            </div>

            <button
              type="button"
              onClick={() => void submitClaim()}
              disabled={submitBusy || !canSubmit}
              style={{ ...primaryBtn, opacity: (submitBusy || !canSubmit) ? 0.5 : 1, cursor: (submitBusy || !canSubmit) ? "not-allowed" : "pointer" }}
            >
              {submitBusy ? <><Spinner className="h-4 w-4" style={{ color: "#fff" }} /> Submitting…</> : "Submit my claim"}
            </button>

            {error ? <p role="alert" style={{ fontSize: 13, color: "#CC0000", margin: 0 }}>{error}</p> : null}
          </div>
        ) : null}

        {/* ── Step 4: Confirmation ── */}
        {step === 4 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.6, marginBottom: 8 }}>
              Head to <strong>{departmentName}</strong>{" "}when you&apos;re ready.
            </p>
            <p style={{ fontSize: 14, color: "#555555", lineHeight: 1.6, marginBottom: 8 }}>
              Staff will ask you to describe the item before handing it over.
            </p>
            <p style={{ fontSize: 13, color: "#666666", lineHeight: 1.6, marginBottom: 28 }}>
              If you left your email, we&apos;ll reach out if we need anything else.
            </p>
            <button type="button" onClick={onClose} style={{ ...primaryBtn, width: "auto", minWidth: 140, padding: "10px 24px" }}>
              Got it
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
