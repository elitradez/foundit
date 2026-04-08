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

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function HomeExplorer({ initialItems, loadError, universityName = "University of Utah", departments = [] }: Props) {
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [aiItemIds, setAiItemIds] = useState<string[] | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const searchCacheRef = useRef<Map<string, string[]>>(new Map());

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of initialItems) {
      if (item.department_id) {
        counts.set(item.department_id, (counts.get(item.department_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [initialItems]);

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
    const base = selectedDept
      ? initialItems.filter((i) => i.department_id === selectedDept)
      : initialItems;
    const q = query.trim();
    if (!q) return base;
    if (aiItemIds === null) return base;
    const idSet = new Set(aiItemIds);
    return base.filter((i) => idSet.has(i.id));
  }, [aiItemIds, initialItems, query, selectedDept]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", fontFamily: FONT, color: "#333333" }}>

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
          <Link
            href="/staff/login"
            style={{ color: "#CC0000", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Staff sign in
          </Link>
        </div>
      </header>

      {/* ── Search / hero ── */}
      <div style={{ backgroundColor: "#F5F5F5", borderBottom: "1px solid #E5E5E5" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "24px 16px" }}>
          <h1 style={{ color: "#1a1a1a", fontSize: 28, fontWeight: 600, margin: "0 0 4px 0" }}>
            Find a lost item
          </h1>
          <p style={{ color: "#666666", fontSize: 14, margin: "0 0 16px 0" }}>
            Search for lost items found across campus. Higher-value items require ownership verification before pickup.
          </p>
          <div style={{ position: "relative" }}>
            {query.trim() && searchBusy ? (
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888888", pointerEvents: "none" }}>
                <Spinner className="h-3.5 w-3.5" style={{ color: "#CC0000" }} />
                Searching…
              </span>
            ) : null}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location, or date…"
              aria-label="Search items"
              style={{ width: "100%", boxSizing: "border-box", backgroundColor: "#FFFFFF", border: "1px solid #CCCCCC", borderRadius: 8, padding: "10px 16px", fontSize: 14, color: "#333333", outline: "none" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#CCCCCC"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main id="main-content" style={{ maxWidth: 1152, margin: "0 auto", padding: "0 16px 48px" }}>

        {/* Department tabs */}
        {departments.length > 0 ? (
          <div style={{ overflowX: "auto", whiteSpace: "nowrap", borderBottom: "1px solid #E5E5E5", marginBottom: 24 }}>
            {[{ id: null, name: "All", count: initialItems.length }, ...departments.map((d) => ({ id: d.id, name: d.name, count: deptCounts.get(d.id) ?? 0 }))].map((tab) => {
              const active = selectedDept === tab.id;
              return (
                <button
                  key={tab.id ?? "__all"}
                  type="button"
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
                  <span style={{ color: active ? "#CC0000" : "#999999", fontWeight: 400 }}>({tab.count})</span>
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

        {/* Empty state */}
        {filtered.length === 0 && !loadError ? (
          <div style={{ textAlign: "center", padding: "64px 24px" }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>📭</p>
            <p style={{ fontSize: 14, color: "#888888" }}>
              {selectedDept && !query.trim()
                ? "No items found at this location."
                : initialItems.length === 0
                ? "No active items right now. Check back soon."
                : "No items found matching your search."}
            </p>
          </div>
        ) : (
          <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, listStyle: "none", padding: 0, margin: 0 }}>
            {filtered.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} onClick={() => setOpenItem(item)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {openItem ? <ClaimModal key={openItem.id} item={openItem} onClose={() => setOpenItem(null)} departmentName={openItem.department_name ?? "Lost & Found"} /> : null}

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #E5E5E5", backgroundColor: "#FFFFFF", padding: "24px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#888888", margin: 0 }}>
          {universityName} Lost &amp; Found &nbsp;·&nbsp;{" "}
          <Link
            href="/privacy"
            style={{ color: "#CC0000", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
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
      aria-label={`Claim ${item.name}`}
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
          className={item.value_tier === "high_value" ? "object-cover blur-xl" : "object-cover"}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
      </div>

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 16px 16px" }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px 0" }}>{item.name}</p>
        {item.value_tier === "low_value" ? (
          <p style={{ fontSize: 12, color: "#CC0000", margin: "0 0 4px 0" }}>
            {item.department_name ?? "Lost & Found"}
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#888888", margin: "0 0 4px 0" }}>🔒 Verify ownership to unlock</p>
        )}
        <p style={{ fontSize: 12, color: "#888888", margin: "0 0 14px 0" }}>Found {item.date_found}</p>

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
      const data = (await res.json().catch(() => ({}))) as { score?: number; revealUrl?: string | null; error?: string };
      if (!res.ok) { setError(data.error ?? "Could not verify description"); return; }
      if (typeof data.score !== "number") { setError("Unexpected response"); return; }
      setScore(data.score);
      if (data.revealUrl && data.score > 60) { setRevealUrl(data.revealUrl); setShowFoundPopup(true); }
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
      if (!name || !studentId) { setError("Please enter your name and student ID."); return; }
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
      if (!res.ok) { setError(data.error ?? "Submit failed"); return; }
      setShowFoundPopup(false);
      setShowClaimForm(false);
      setClaimSubmitted(true);
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
    outline: "none",
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

  return (
    <div className="anim-fade-in" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
        className="anim-pop-in sm:items-center"
        style={{ maxHeight: "92vh", width: "100%", maxWidth: 512, overflowY: "auto", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", fontFamily: FONT }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #E5E5E5", padding: "16px 20px" }}>
          <div>
            <h2 id="claim-title" style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
              {claimSubmitted ? "Claim submitted" : "Claim item"}
            </h2>
            {!claimSubmitted ? <p style={{ marginTop: 2, fontSize: 13, color: "#666666" }}>{item.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 36, padding: "6px 14px", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 4, fontSize: 13, color: "#555555", cursor: "pointer", fontFamily: FONT }}
          >
            Close
          </button>
        </div>

        {/* Body */}
        {claimSubmitted ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 28, marginBottom: 12 }}>✓</p>
            <p style={{ fontSize: 15, color: "#333333", lineHeight: 1.6, marginBottom: 24 }}>
              Your claim has been submitted. Head to <strong>{departmentName}</strong> with your student ID to pick up your item.
            </p>
            <button type="button" onClick={onClose} style={{ ...primaryBtn, width: "auto", minWidth: 140, padding: "10px 24px" }}>
              Done
            </button>
          </div>

        ) : item.value_tier === "low_value" ? (
          <div style={{ padding: "20px" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5", borderRadius: 6, overflow: "hidden", marginBottom: 16, border: "1px solid #E5E5E5" }}>
              <Image src={`/api/items/${item.id}/blur`} alt={item.name} fill className="object-cover" sizes="512px" unoptimized />
            </div>

            <p style={{ backgroundColor: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 6, padding: "10px 14px", fontSize: 14, color: "#333333", marginBottom: 16 }}>
              <span aria-hidden="true">📍 </span>Pick up at: <strong>{departmentName}</strong>
            </p>

            {showClaimForm ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>Your name</span>
                  <input value={studentName} onChange={(e) => setStudentName(e.target.value)} style={inputStyle} autoComplete="name"
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }} />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>Student ID</span>
                  <input value={studentIdNumber} onChange={(e) => setStudentIdNumber(e.target.value)} style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }} />
                </label>
                {item.requires_pin ? (
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>Item PIN</span>
                    <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Provided when the item was logged" style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }} />
                  </label>
                ) : null}
                <button type="button" onClick={() => void submitClaim()} disabled={submitBusy} style={{ ...primaryBtn, opacity: submitBusy ? 0.6 : 1 }}>
                  {submitBusy ? <><Spinner className="h-4 w-4" style={{ color: "#fff" }} /> Submitting…</> : "Submit claim"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowClaimForm(true)} style={primaryBtn}>
                This is mine →
              </button>
            )}

            {error ? <p style={{ marginTop: 10, fontSize: 13, color: "#CC0000" }}>{error}</p> : null}
          </div>

        ) : (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {score !== null ? (
              <p style={{ fontSize: 14, color: "#555555" }}>
                Match score: <strong style={{ color: "#1a1a1a" }}>{score}</strong>
                {score > 60
                  ? <span style={{ color: "#16a34a" }}> — strong match</span>
                  : <span style={{ color: "#d97706" }}> — need a stronger match to unlock (&gt; 60)</span>}
              </p>
            ) : null}

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>
                Describe your item so we can verify it&apos;s yours
              </span>
              <textarea
                value={studentDescription}
                onChange={(e) => setStudentDescription(e.target.value)}
                rows={4}
                placeholder="Color, brand, distinguishing features…"
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </label>

            {item.requires_pin ? (
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#333333", marginBottom: 6 }}>Item PIN</span>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Provided when the item was logged" style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#CC0000"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.boxShadow = "none"; }} />
              </label>
            ) : null}

            <button type="button" onClick={() => void checkMatch()} disabled={matchBusy || !studentDescription.trim()} style={{ ...primaryBtn, opacity: matchBusy || !studentDescription.trim() ? 0.5 : 1 }}>
              {matchBusy ? <><Spinner className="h-4 w-4" style={{ color: "#fff" }} /> Checking…</> : "Verify description"}
            </button>

            {error ? <p style={{ fontSize: 13, color: "#CC0000" }}>{error}</p> : null}
          </div>
        )}
      </div>

      {/* Found popup */}
      {showFoundPopup && revealUrl ? (
        <div className="anim-fade-in" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", padding: 16 }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="found-popup-title"
            className="anim-pop-in"
            style={{ width: "100%", maxWidth: 448, backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: FONT }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px 0" }}>
              <button type="button" onClick={() => setShowFoundPopup(false)} aria-label="Close"
                style={{ minHeight: 36, padding: "6px 14px", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 4, fontSize: 13, color: "#555555", cursor: "pointer", fontFamily: FONT }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5", borderRadius: 6, overflow: "hidden", marginBottom: 16, border: "1px solid #E5E5E5" }}>
                <Image src={revealUrl} alt={item.name} fill className="object-cover" sizes="448px" unoptimized />
              </div>
              <p id="found-popup-title" style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#16a34a", marginBottom: 4 }}>✓ Item Found!</p>
              <p style={{ textAlign: "center", fontSize: 16, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>{item.name}</p>
              <p style={{ backgroundColor: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 6, padding: "10px 14px", fontSize: 14, color: "#333333", marginBottom: 16 }}>
                <span aria-hidden="true">📍 </span>Pick up at: <strong>{departmentName}</strong>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" onClick={() => { setShowFoundPopup(false); setShowClaimForm(true); }} disabled={submitBusy}
                  style={{ ...primaryBtn, opacity: submitBusy ? 0.6 : 1 }}>
                  This is mine →
                </button>
                <button type="button" onClick={handleNotMineGoBack} disabled={submitBusy}
                  style={{ display: "inline-flex", width: "100%", alignItems: "center", justifyContent: "center", minHeight: 44, backgroundColor: "#FFFFFF", color: "#333333", fontSize: 14, fontWeight: 600, border: "1px solid #E5E5E5", borderRadius: 4, cursor: "pointer", opacity: submitBusy ? 0.5 : 1, fontFamily: FONT }}>
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
