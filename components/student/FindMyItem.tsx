"use client";

import Image from "next/image";
import { useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Spinner } from "@/components/ui/Spinner";
import { ClaimModal } from "@/components/student/HomeExplorer";

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

type Department = { id: string; name: string };

type FindMatch = {
  id: string;
  name: string;
  date_found: string | null;
  department_name: string | null;
  photoUrl: string | null; // null -> render the blurred proxy
};

type Phase = "form" | "searching" | "results" | "no-match";

export function FindMyItem({
  departments,
  onClose,
  onClaimSubmitted,
}: {
  departments: Department[];
  onClose: () => void;
  onClaimSubmitted: () => void;
}) {
  const sheetRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [phase, setPhase] = useState<Phase>("form");
  const [description, setDescription] = useState("");
  const [locationLost, setLocationLost] = useState("");
  const [dateLost, setDateLost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [findRequestId, setFindRequestId] = useState<string | null>(null);
  const [claimItem, setClaimItem] = useState<FindMatch | null>(null);
  // SMS alert sub-state on the no-match screen
  const [phone, setPhone] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertDone, setAlertDone] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const tooShort = description.trim().length < 20;

  async function submitFind() {
    setError(null);
    setPhase("searching");
    try {
      const res = await fetch("/api/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          locationLost: locationLost || undefined,
          dateLost: dateLost || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        findRequestId?: string;
        matches?: FindMatch[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Search failed. Please try again.");
        setPhase("form");
        return;
      }
      setFindRequestId(data.findRequestId ?? null);
      const found = Array.isArray(data.matches) ? data.matches : [];
      setMatches(found);
      setPhase(found.length > 0 ? "results" : "no-match");
    } catch {
      setError("Couldn’t reach the server — please check your connection and try again.");
      setPhase("form");
    }
  }

  async function registerAlert() {
    setAlertError(null);
    setAlertBusy(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findRequestId, phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setAlertError(data.error ?? "Could not save your alert.");
        return;
      }
      setAlertDone(true);
    } catch {
      setAlertError("Couldn’t reach the server — please try again.");
    } finally {
      setAlertBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "#FFFFFF",
    border: "1px solid #CCCCCC",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 16, // ≥16px so iOS doesn't zoom on focus
    color: "#333333",
    outline: "none",
    fontFamily: FONT,
    minHeight: 48,
  };

  const primaryBtn: React.CSSProperties = {
    display: "inline-flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    backgroundColor: "#CC0000",
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: FONT,
  };

  const focusRing = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      e.currentTarget.style.borderColor = "#CC0000";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.12)";
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      e.currentTarget.style.borderColor = "#CCCCCC";
      e.currentTarget.style.boxShadow = "none";
    },
  };

  return (
    <div
      className="anim-fade-in"
      style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== "searching") onClose(); }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-title"
        className="anim-pop-in"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "94vh",
          overflowY: "auto",
          backgroundColor: "#FFFFFF",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
          fontFamily: FONT,
          color: "#333333",
        }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E5", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1, borderRadius: "16px 16px 0 0" }}>
          <h2 id="find-title" style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
            {phase === "results" ? "Possible matches" : phase === "no-match" ? "No strong matches yet" : "Find my item"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "searching"}
            style={{ minHeight: 40, padding: "8px 16px", backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 6, fontSize: 14, color: "#555555", cursor: phase === "searching" ? "not-allowed" : "pointer", opacity: phase === "searching" ? 0.5 : 1, fontFamily: FONT }}
          >
            Close
          </button>
        </div>

        {/* ── Form ── */}
        {phase === "form" ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ fontSize: 14, color: "#555555", lineHeight: 1.5, margin: 0 }}>
              Describe what you lost and we&apos;ll check everything that&apos;s been turned in.
              The more detail, the better the match.
            </p>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
                What did you lose? <span style={{ color: "#CC0000" }}>*</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="e.g. Dark green Hydro Flask with a dent on the side, black lid, 'Emma' written on the bottom"
                style={{ ...inputStyle, resize: "vertical" }}
                {...focusRing}
              />
              <span style={{ display: "block", marginTop: 4, fontSize: 12, color: tooShort && description.length > 0 ? "#CC0000" : "#666666" }}>
                Include color, brand, stickers, damage — anything that makes it yours.
              </span>
            </label>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
                Where did you lose it? <span style={{ color: "#666666", fontWeight: 400 }}>(optional)</span>
              </span>
              <select
                value={locationLost}
                onChange={(e) => setLocationLost(e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}
                {...focusRing}
              >
                <option value="">Not sure</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
                When did you lose it? <span style={{ color: "#666666", fontWeight: 400 }}>(optional)</span>
              </span>
              <input
                type="date"
                value={dateLost}
                onChange={(e) => setDateLost(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                style={inputStyle}
                {...focusRing}
              />
            </label>

            <button
              type="button"
              onClick={() => void submitFind()}
              disabled={tooShort}
              style={{ ...primaryBtn, opacity: tooShort ? 0.5 : 1, cursor: tooShort ? "not-allowed" : "pointer" }}
            >
              Search for my item
            </button>

            {error ? <p role="alert" style={{ fontSize: 14, color: "#CC0000", margin: 0 }}>{error}</p> : null}
          </div>
        ) : null}

        {/* ── Searching ── */}
        {phase === "searching" ? (
          <div style={{ padding: "56px 20px", textAlign: "center" }} role="status">
            <Spinner className="h-8 w-8" style={{ color: "#CC0000", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px" }}>Checking what&apos;s been turned in…</p>
            <p style={{ fontSize: 13, color: "#666666", margin: 0 }}>This takes a few seconds.</p>
          </div>
        ) : null}

        {/* ── Results ── */}
        {phase === "results" ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: "#555555", lineHeight: 1.5, margin: 0 }}>
              {matches.length === 1 ? "We found 1 item that could be yours." : `We found ${matches.length} items that could be yours.`}
            </p>
            {matches.map((m) => (
              <div key={m.id} style={{ border: "1px solid #E5E5E5", borderRadius: 12, overflow: "hidden", backgroundColor: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5" }}>
                  <Image
                    src={m.photoUrl ?? `/api/items/${m.id}/blur`}
                    alt={m.photoUrl ? `Photo of ${m.name}` : ""}
                    fill
                    className={m.photoUrl ? "object-cover" : "object-cover blur-xl"}
                    sizes="(max-width: 640px) 100vw, 560px"
                    unoptimized
                  />
                  {!m.photoUrl ? (
                    <span style={{ position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(26,26,26,0.8)", color: "#FFFFFF", fontSize: 11, fontWeight: 500, padding: "4px 8px", borderRadius: 4 }}>
                      Photo hidden — staff verify in person
                    </span>
                  ) : null}
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", margin: "0 0 2px" }}>{m.name}</p>
                  <p style={{ fontSize: 13, color: "#666666", margin: "0 0 12px" }}>
                    {m.department_name ?? "Lost & Found"}{m.date_found ? ` · found ${m.date_found}` : ""}
                  </p>
                  <button type="button" onClick={() => setClaimItem(m)} style={primaryBtn}>
                    Yes, this is mine
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => { setPhase("form"); setMatches([]); }}
              style={{ background: "none", border: "none", color: "#CC0000", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 12, fontFamily: FONT }}
            >
              None of these — search again
            </button>
          </div>
        ) : null}

        {/* ── No match + SMS alert ── */}
        {phase === "no-match" ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 36, textAlign: "center", margin: "12px 0 0" }}>🔎</p>
            <p style={{ fontSize: 15, color: "#1a1a1a", fontWeight: 600, textAlign: "center", margin: 0 }}>
              Nothing matching has been turned in yet.
            </p>
            <p style={{ fontSize: 14, color: "#555555", lineHeight: 1.5, textAlign: "center", margin: 0 }}>
              Items arrive every day. Leave your number and we&apos;ll text you if something matching your description is logged.
            </p>

            {alertDone ? (
              <p role="status" style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 8, padding: "12px 16px", fontSize: 14, textAlign: "center", margin: 0 }}>
                ✓ You&apos;re on the list — we&apos;ll text you if it shows up.
              </p>
            ) : (
              <>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Phone number</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(801) 555-0100"
                    autoComplete="tel"
                    style={inputStyle}
                    {...focusRing}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void registerAlert()}
                  disabled={alertBusy || phone.trim().length < 10}
                  style={{ ...primaryBtn, opacity: alertBusy || phone.trim().length < 10 ? 0.5 : 1 }}
                >
                  {alertBusy ? <><Spinner className="h-4 w-4" style={{ color: "#fff" }} /> Saving…</> : "Text me if it shows up"}
                </button>
                <p style={{ fontSize: 12, color: "#666666", textAlign: "center", margin: 0 }}>
                  One text if a match is logged. Msg &amp; data rates may apply.
                </p>
                {alertError ? <p role="alert" style={{ fontSize: 14, color: "#CC0000", margin: 0, textAlign: "center" }}>{alertError}</p> : null}
              </>
            )}

            <button
              type="button"
              onClick={() => { setPhase("form"); setAlertDone(false); }}
              style={{ background: "none", border: "none", color: "#CC0000", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 12, fontFamily: FONT }}
            >
              Edit my description and try again
            </button>
          </div>
        ) : null}
      </div>

      {/* Existing claim contact form, entered at the contact step with the
          committed description — the form itself is unchanged. */}
      {claimItem ? (
        <ClaimModal
          key={claimItem.id}
          item={{ id: claimItem.id, name: claimItem.name }}
          departmentName={claimItem.department_name ?? "Lost & Found"}
          onClose={() => setClaimItem(null)}
          onSubmitted={onClaimSubmitted}
          initialStep={3}
          committedDescription={description.trim()}
          findRequestId={findRequestId ?? undefined}
        />
      ) : null}
    </div>
  );
}
