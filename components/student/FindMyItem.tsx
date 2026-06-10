"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ClaimModal } from "@/components/student/HomeExplorer";

// Matches the student page: white surface, university red, system font.
const SURFACE = "#FFFFFF";
const INK = "#1a1a1a";
const INK_60 = "#666666";
const INK_40 = "#999999";
const BRAND = "#CC0000";
const HAIRLINE = "1px solid #E5E5E5";

type Department = { id: string; name: string };

type FindMatch = {
  id: string;
  name: string;
  date_found: string | null;
  department_name: string | null;
  photoUrl: string | null; // null -> render the blurred proxy
  requiresPin: boolean;
};

type WizardStep = 1 | 2 | 3;
type Phase = "wizard" | "searching" | "results" | "no-match";

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
  const [phase, setPhase] = useState<Phase>("wizard");
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [description, setDescription] = useState("");
  const [locationLost, setLocationLost] = useState("");
  const [dateLost, setDateLost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [findRequestId, setFindRequestId] = useState<string | null>(null);
  const [claimItem, setClaimItem] = useState<FindMatch | null>(null);
  const [phone, setPhone] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertDone, setAlertDone] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const stepInputRef = useRef<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement | null>(null);

  // No minimum length: "knife" is a legitimate search. The anti-fraud unblur
  // gates are what protect photos, not input friction — a terse description
  // just yields blurred matches plus the verify step.
  const tooShort = description.trim().length === 0;

  // Each step swap unmounts the previously focused control; refocus the new
  // step's input so keyboard and screen-reader users land somewhere sensible.
  useEffect(() => {
    if (phase === "wizard") stepInputRef.current?.focus();
  }, [step, phase]);

  function goForward() {
    setDirection("forward");
    if (step < 3) setStep((s) => (s + 1) as WizardStep);
    else void submitFind();
  }

  function goBack() {
    setDirection("back");
    if (phase === "results" || phase === "no-match") {
      setPhase("wizard");
      setStep(3);
      return;
    }
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  }

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
        setPhase("wizard");
        return;
      }
      setFindRequestId(data.findRequestId ?? null);
      const found = Array.isArray(data.matches) ? data.matches : [];
      setMatches(found);
      setDirection("forward");
      setPhase(found.length > 0 ? "results" : "no-match");
    } catch {
      setError("Couldn’t reach the server — check your connection and try again.");
      setPhase("wizard");
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

  const stepAnim = direction === "forward" ? "wiz-step-in" : "wiz-step-back";

  const inputBase: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "#FFFFFF",
    border: "1px solid #CCCCCC",
    borderRadius: 8,
    padding: "14px 16px",
    fontSize: 16, // ≥16px so iOS doesn't zoom on focus
    color: INK,
    outline: "none",
    minHeight: 52,
  };

  const primaryBtn: React.CSSProperties = {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    backgroundColor: BRAND,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  };

  const ghostBtn: React.CSSProperties = {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: "#FFFFFF",
    color: "#333333",
    fontSize: 15,
    fontWeight: 500,
    border: "1px solid #E5E5E5",
    borderRadius: 8,
    cursor: "pointer",
  };

  const heading = (text: string) => (
    <h2
      id="find-title"
            style={{ fontSize: 24, fontWeight: 600, color: INK, margin: "0 0 6px", lineHeight: 1.2 }}
    >
      {text}
    </h2>
  );

  const instruction = (text: string) => (
    <p style={{ fontSize: 14, color: INK_60, margin: "0 0 28px", lineHeight: 1.5 }}>{text}</p>
  );

  const totalSteps = 4;
  const currentDot = phase === "wizard" ? step : 4;

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-4"
      style={{ backgroundColor: "rgba(12,12,12,0.45)", backdropFilter: "blur(4px)", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== "searching") onClose(); }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-title"
        className="anim-pop-in flex h-full w-full flex-col sm:h-auto sm:max-h-[88vh] sm:max-w-[540px] sm:rounded-2xl"
        style={{ backgroundColor: SURFACE, color: "#333333", boxShadow: "0 24px 80px rgba(12,12,12,0.35)", overflow: "hidden" }}
      >
        {/* Chrome: back · dots · close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: HAIRLINE, flexShrink: 0 }}>
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            disabled={phase === "searching" || (phase === "wizard" && step === 1)}
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 8, color: INK, fontSize: 22, cursor: "pointer", opacity: phase === "searching" || (phase === "wizard" && step === 1) ? 0 : 1, pointerEvents: phase === "searching" || (phase === "wizard" && step === 1) ? "none" : "auto" }}
          >
            ←
          </button>

          <div aria-hidden="true" style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  backgroundColor: i < currentDot ? BRAND : "#E5E5E5",
                  transition: "background-color 200ms",
                }}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">Step {currentDot} of {totalSteps}</span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={phase === "searching"}
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 8, color: INK, fontSize: 20, cursor: phase === "searching" ? "not-allowed" : "pointer", opacity: phase === "searching" ? 0.4 : 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {phase === "wizard" && step === 1 ? (
            <div key="s1" className={stepAnim} style={{ padding: "36px 24px 24px" }}>
              {heading("What did you lose?")}
              {instruction("Describe it like you’d tell a friend. Color, brand, anything distinctive.")}
              <textarea
                ref={(el) => { stepInputRef.current = el; }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Dark green Hydro Flask, dent on the side, ‘Emma’ on the bottom"
                aria-label="Describe your lost item"
                style={{ ...inputBase, resize: "none", lineHeight: 1.5 }}
              />
              <p style={{ fontSize: 13, color: INK_60, margin: "8px 0 0" }}>More detail means better matches — but one word works too.</p>
              {error ? <p role="alert" style={{ fontSize: 14, color: "#CC0000", margin: "12px 0 0" }}>{error}</p> : null}
            </div>
          ) : null}

          {phase === "wizard" && step === 2 ? (
            <div key="s2" className={stepAnim} style={{ padding: "36px 24px 24px" }}>
              {heading("Where did you lose it?")}
              {instruction("Your best guess. Skip if you’re not sure.")}
              <select
                ref={(el) => { stepInputRef.current = el; }}
                value={locationLost}
                onChange={(e) => setLocationLost(e.target.value)}
                aria-label="Where you lost it"
                style={{ ...inputBase, appearance: "auto" }}
              >
                <option value="">Not sure</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          {phase === "wizard" && step === 3 ? (
            <div key="s3" className={stepAnim} style={{ padding: "36px 24px 24px" }}>
              {heading("When did you lose it?")}
              {instruction("Roughly is fine. Skip if you don’t remember.")}
              <input
                ref={(el) => { stepInputRef.current = el; }}
                type="date"
                value={dateLost}
                onChange={(e) => setDateLost(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                aria-label="When you lost it"
                style={inputBase}
              />
              {error ? <p role="alert" style={{ fontSize: 14, color: "#CC0000", margin: "12px 0 0" }}>{error}</p> : null}
            </div>
          ) : null}

          {phase === "searching" ? (
            <div style={{ padding: "96px 24px", textAlign: "center" }} role="status">
              <p className="wiz-searching" style={{ fontSize: 18, fontWeight: 600, color: INK, margin: 0 }}>
                Searching…
              </p>
            </div>
          ) : null}

          {phase === "results" ? (
            <div key="results" className={stepAnim} style={{ padding: "32px 24px 24px" }}>
              {heading(matches.length === 1 ? "One possible match" : `${matches.length} possible matches`)}
              {instruction("Tap the one that’s yours.")}
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {matches.map((m) => (
                  <div key={m.id}>
                    <button
                      type="button"
                      onClick={() => setClaimItem(m)}
                      aria-label={`${m.photoUrl ? "Claim" : "Verify and claim"} ${m.name}`}
                      style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", borderRadius: 12, overflow: "hidden" }}
                    >
                      <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "4/3", backgroundColor: "#F5F5F5" }}>
                        <Image
                          src={m.photoUrl ?? `/api/items/${m.id}/blur`}
                          alt={m.photoUrl ? `Photo of ${m.name}` : ""}
                          fill
                          className={m.photoUrl ? "object-cover" : "object-cover blur-xl"}
                          sizes="(max-width: 640px) 100vw, 540px"
                          unoptimized
                        />
                        {!m.photoUrl ? (
                          <span style={{ position: "absolute", bottom: 10, left: 10, backgroundColor: "rgba(26,26,26,0.8)", color: "#FFFFFF", fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6 }}>
                            {m.requiresPin ? "Photo hidden · PIN required at pickup" : "Photo hidden · verify to view"}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <div style={{ padding: "12px 2px 0" }}>
                      <p style={{ fontSize: 18, fontWeight: 600, color: INK, margin: "0 0 2px", lineHeight: 1.2 }}>{m.name}</p>
                      <p style={{ fontSize: 13, color: INK_60, margin: "0 0 12px" }}>
                        {m.department_name ?? "Lost & Found"}{m.date_found ? ` · found ${m.date_found}` : ""}
                      </p>
                      <button type="button" onClick={() => setClaimItem(m)} style={primaryBtn}>
                        {m.photoUrl ? "Yes, this is mine" : "Verify it’s mine"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={goBack} style={{ ...ghostBtn, marginTop: 20 }}>
                None of these — edit my search
              </button>
            </div>
          ) : null}

          {phase === "no-match" ? (
            <div key="nomatch" className={stepAnim} style={{ padding: "36px 24px 24px" }}>
              {heading("No strong matches yet")}
              {instruction("New items arrive daily. Leave your number — one text if it shows up.")}
              {alertDone ? (
                <p role="status" style={{ border: "1px solid #BBF7D0", borderRadius: 8, padding: "16px 18px", fontSize: 15, color: "#166534", margin: 0, backgroundColor: "#F0FDF4" }}>
                  ✓ You’re on the list.
                </p>
              ) : (
                <>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(801) 555-0100"
                    autoComplete="tel"
                    aria-label="Phone number"
                    style={inputBase}
                  />
                  <button
                    type="button"
                    onClick={() => void registerAlert()}
                    disabled={alertBusy || phone.trim().length < 10}
                    style={{ ...primaryBtn, marginTop: 12, opacity: alertBusy || phone.trim().length < 10 ? 0.45 : 1 }}
                  >
                    {alertBusy ? "Saving…" : "Text me if it shows up"}
                  </button>
                  <p style={{ fontSize: 12, color: INK_40, margin: "10px 0 0", textAlign: "center" }}>
                    Msg &amp; data rates may apply.
                  </p>
                  {alertError ? <p role="alert" style={{ fontSize: 14, color: "#CC0000", margin: "10px 0 0", textAlign: "center" }}>{alertError}</p> : null}
                </>
              )}
              <button type="button" onClick={goBack} style={{ ...ghostBtn, marginTop: 20 }}>
                Edit my search
              </button>
            </div>
          ) : null}
        </div>

        {/* Footer: Next/Skip — pinned, thumb-reachable */}
        {phase === "wizard" ? (
          <div style={{ flexShrink: 0, borderTop: HAIRLINE, padding: "16px 24px", paddingBottom: "max(16px, env(safe-area-inset-bottom))", backgroundColor: SURFACE }}>
            <button
              type="button"
              onClick={goForward}
              disabled={step === 1 && tooShort}
              style={{ ...primaryBtn, opacity: step === 1 && tooShort ? 0.45 : 1, cursor: step === 1 && tooShort ? "not-allowed" : "pointer" }}
            >
              {step === 3 ? "Search" : "Next"}
            </button>
            {step > 1 ? (
              <button type="button" onClick={goForward} style={{ ...ghostBtn, marginTop: 6 }}>
                Skip
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The existing browse claim modal, reused wholesale:
          - photo already unblurred (both gates passed) -> straight to the
            contact step; the verification already happened server-side.
          - photo still blurred -> enter at the DESCRIBE step, prefilled with
            the committed description, so the student goes through the same
            verify-and-unblur sequence the browse flow uses. */}
      {claimItem ? (
        <ClaimModal
          key={claimItem.id}
          item={{ id: claimItem.id, name: claimItem.name }}
          departmentName={claimItem.department_name ?? "Lost & Found"}
          onClose={() => setClaimItem(null)}
          onSubmitted={onClaimSubmitted}
          initialStep={claimItem.photoUrl ? 3 : 1}
          committedDescription={description.trim()}
          findRequestId={findRequestId ?? undefined}
        />
      ) : null}
    </div>
  );
}
