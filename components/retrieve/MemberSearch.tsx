"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemPhoto } from "@/components/retrieve/ItemPhoto";
import { TextInput } from "@/components/retrieve/ui";
import { useRetrieveData } from "@/lib/retrieve/store";
import { RETRIEVE_CATEGORIES, categoryByKey, type CategoryKey } from "@/lib/retrieve/config";
import { T } from "@/lib/retrieve/tokens";
import { RetrieveStateNote, RetrieveSpinner } from "@/components/retrieve/StateViews";

/** Minimal shape the result card needs — satisfied by both local items and API hits. */
type CardItem = {
  id: string;
  name: string;
  category: CategoryKey;
  location: string;
  dateFound: string;
  photo: string | null;
  reason?: string;
};

type ApiItem = {
  id: string;
  name: string;
  category: string;
  location: string;
  dateFound: string;
  photo: string | null;
  reason?: string;
};

type AiState = {
  forQuery: string;
  mode: "ai" | "vector" | "degraded" | "empty";
  noStrongMatch: boolean;
  results: ApiItem[];
  candidates: ApiItem[];
};

function apiToCard(i: ApiItem): CardItem {
  return {
    id: i.id,
    name: i.name,
    category: i.category as CategoryKey,
    location: i.location,
    dateFound: i.dateFound,
    photo: i.photo,
    reason: i.reason,
  };
}

export function MemberSearch() {
  const { items, loading, error } = useRetrieveData();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const router = useRouter();

  const active = useMemo(() => items.filter((i) => i.status === "active"), [items]);

  // Which categories actually have active items — drives the filter chips.
  const availableCats = useMemo(() => {
    const present = new Set(active.map((i) => i.category));
    return RETRIEVE_CATEGORIES.filter((c) => present.has(c.key));
  }, [active]);

  // Instant layer: local substring filter, shown immediately while AI runs.
  const instant = useMemo<CardItem[]>(() => {
    const q = query.trim().toLowerCase();
    return active
      .filter((i) => (cat === "all" ? true : i.category === cat))
      .filter((i) => !q || `${i.name} ${i.location} ${i.notes} ${categoryByKey(i.category).label}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => ({ id: i.id, name: i.name, category: i.category, location: i.location, dateFound: i.dateFound, photo: i.photo }));
  }, [active, cat, query]);

  // AI layer: debounced hybrid search (vector retrieval + Haiku rerank).
  const [ai, setAi] = useState<AiState | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setAi(null);
      setAiLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setAiLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/retrieve/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, category: cat }),
        });
        const data = (await res.json()) as Omit<AiState, "forQuery">;
        if (reqId !== reqIdRef.current) return; // a newer query superseded this one
        setAi({ forQuery: q, ...data });
      } catch {
        if (reqId === reqIdRef.current) setAi({ forQuery: q, mode: "degraded", noStrongMatch: false, results: [], candidates: [] });
      } finally {
        if (reqId === reqIdRef.current) setAiLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, cat]);

  const searching = query.trim().length >= 2;
  const aiReady = ai !== null && ai.forQuery === query.trim();

  // Decide what to render. AI ranked results win; honest no-match shows the
  // closest candidates under a clear "not a confident match" banner; degraded
  // or pre-result states fall back to the instant local list.
  let banner: string | null = null;
  let display: CardItem[] = instant;
  let showReasons = false;

  if (searching && aiReady && ai) {
    if (ai.mode === "ai" && ai.results.length > 0) {
      display = ai.results.map(apiToCard);
      showReasons = true;
      banner = "Best matches";
    } else if (ai.mode === "ai" && ai.noStrongMatch) {
      display = ai.candidates.map(apiToCard);
      banner = `No confident match for “${ai.forQuery}”. Here's what's closest — start a claim only if one is really yours.`;
    } else if (ai.mode === "vector" && ai.results.length > 0) {
      display = ai.results.map(apiToCard);
      banner = "Closest matches";
    }
    // mode "degraded"/"empty" → keep instant
  }

  return (
    <div>
      {/* Search hero */}
      <section style={{ backgroundColor: T.muted, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px 28px" }}>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Find your lost item</h1>
          <p style={{ color: T.mutedForeground, fontSize: 16, margin: "0 0 18px", maxWidth: 560 }}>
            Search everything turned in. IDs, wallets and phones are blurred — start a claim and describe it to prove it&apos;s yours.
          </p>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by item, brand, or where you lost it…"
            aria-label="Search lost items"
            type="search"
            style={{ fontSize: 17, padding: "15px 17px" }}
          />
        </div>
      </section>

      <main id="main-content" style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 20px 64px" }}>
        {/* Category chips */}
        {availableCats.length > 0 ? (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
            <Chip label="All" active={cat === "all"} onClick={() => setCat("all")} />
            {availableCats.map((c) => (
              <Chip key={c.key} label={`${c.icon} ${c.label}`} active={cat === c.key} onClick={() => setCat(c.key)} />
            ))}
          </div>
        ) : null}

        {error === "not-configured" ? (
          <RetrieveStateNote kind="config" />
        ) : error ? (
          <RetrieveStateNote kind="error" detail={error} />
        ) : loading && active.length === 0 ? (
          <RetrieveSpinner label="Loading lost items…" />
        ) : (
          <>
            {/* Status line: AI progress, or the no-match / heading banner. */}
            {searching && aiLoading && !aiReady ? (
              <p style={{ fontSize: 14, color: T.mutedForeground, margin: "0 0 14px" }}>
                <span aria-hidden>✨</span> Finding your best matches…
              </p>
            ) : banner ? (
              <p style={{ fontSize: 14, color: T.mutedForeground, margin: "0 0 14px" }}>{banner}</p>
            ) : display.length > 0 ? (
              <p style={{ fontSize: 14, color: T.mutedForeground, margin: "0 0 14px" }}>{display.length} item{display.length === 1 ? "" : "s"}</p>
            ) : null}

            {display.length === 0 ? (
              <div style={{ textAlign: "center", padding: "72px 24px", color: T.mutedForeground }}>
                <p style={{ fontSize: 44, margin: "0 0 12px" }}>🔍</p>
                <p style={{ fontSize: 16, margin: 0 }}>
                  {active.length === 0
                    ? "Nothing's been turned in yet. Check back soon."
                    : searching
                      ? `Nothing matches “${query.trim()}” — try a different word or category.`
                      : "No items match — try a different word or category."}
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
                {display.map((item) => (
                  <li key={item.id}>
                    <ResultCard item={item} showReason={showReasons} onClaim={() => router.push(`/retrieve/claim?item=${encodeURIComponent(item.id)}`)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        fontFamily: T.fontBody,
        fontSize: 14,
        fontWeight: 600,
        padding: "9px 15px",
        borderRadius: 999,
        border: `1px solid ${active ? T.primaryStrong : T.border}`,
        backgroundColor: active ? "#FFF1E8" : T.background,
        color: active ? "#B23F08" : T.mutedForeground,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function ResultCard({ item, showReason, onClaim }: { item: CardItem; showReason?: boolean; onClaim: () => void }) {
  const [hover, setHover] = useState(false);
  const cat = categoryByKey(item.category);
  return (
    <button
      type="button"
      onClick={onClaim}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Start a claim for ${item.name}`}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        textAlign: "left",
        padding: 0,
        backgroundColor: T.background,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        boxShadow: hover ? T.cardShadowHover : T.cardShadow,
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow .15s, transform .15s",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      <ItemPhoto category={item.category} photo={item.photo} aspectRatio="4 / 3" />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", flex: 1 }}>
        <p style={{ margin: "0 0 6px", fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16, color: T.foreground }}>{item.name}</p>
        <p style={{ margin: 0, fontSize: 13, color: T.mutedForeground }}>{cat.icon} {cat.label}</p>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: T.mutedForeground }}>{item.location} · Found {item.dateFound}</p>
        {showReason && item.reason ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.4, color: "#B23F08", backgroundColor: "#FFF1E8", borderRadius: 8, padding: "8px 10px" }}>
            <span aria-hidden>✨ </span>{item.reason}
          </p>
        ) : null}
        <span
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 44,
            borderRadius: 12,
            backgroundColor: hover ? "#B23F08" : T.primaryStrong,
            color: "#fff",
            fontFamily: T.fontDisplay,
            fontWeight: 600,
            fontSize: 15,
            transition: "background-color .15s",
          }}
        >
          This is mine →
        </span>
      </div>
    </button>
  );
}
