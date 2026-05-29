"use client";

import Link from "next/link";
import { Work_Sans } from "next/font/google";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Work Sans (humanist sans) carries the "human" feel. Self-hosted via next/font,
// scoped to this component so no change to app/layout.tsx is needed.
const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });
const FONT = workSans.style.fontFamily;
const TEXT = "#1F2328"; // near-black, never pure black
const MUTED = "#62666D"; // muted grey, AA on white
const INK_HOVER = "#2E333B"; // near-black button hover (slightly lighter)
const HAIRLINE = "rgba(0,0,0,0.06)";
const OUTLINE = "rgba(0,0,0,0.18)"; // neutral step numeral outline

// Per-tenant logo sourcing. No tenant logo field exists in config yet, so this
// reads an optional public env var; when unset we fall back to the name.
// A real `logoUrl` should be promoted to getUniversityConfig() (see PR note).
const LOGO_URL = process.env.NEXT_PUBLIC_UNIVERSITY_LOGO_URL?.trim() || null;

type Props = {
  universityName: string;
  /** Tenant brand color sourced from getUniversityConfig().brandColor */
  brandColor: string;
  /** Tenant brand hover color sourced from getUniversityConfig().brandColorHover */
  brandColorHover: string;
  onClose: () => void;
};

const STEPS = [
  { n: 1, title: "Search for your item" },
  { n: 2, title: "Describe it to prove it's yours" },
  { n: 3, title: "Pick it up" },
];

export function WelcomeModal({ universityName, brandColor, onClose }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  return (
    <div
      className="anim-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Scoped entrance keyframes (React 19 hoists this). */}
      <style>{`
        @keyframes welcomePop {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        .welcome-card { animation: welcomePop 200ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .welcome-card { animation: none; }
        }
      `}</style>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
        className="welcome-card"
        style={{
          maxHeight: "92vh",
          width: "100%",
          maxWidth: 420,
          overflowY: "auto",
          backgroundColor: "#FFFFFF",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 10,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 12px 28px rgba(0,0,0,0.1)",
          fontFamily: FONT,
          letterSpacing: "-0.011em",
        }}
      >
        {/* Header: tenant logo (or name fallback) + close */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "24px 24px 0",
          }}
        >
          {LOGO_URL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={LOGO_URL}
              alt={universityName}
              style={{ height: 32, width: "auto", display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 16, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: "-0.011em" }}>
              {universityName}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close welcome dialog"
            style={{
              flexShrink: 0,
              minHeight: 32,
              minWidth: 32,
              padding: "4px 8px",
              backgroundColor: "transparent",
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 6,
              fontSize: 16,
              lineHeight: 1,
              color: MUTED,
              cursor: "pointer",
              fontFamily: FONT,
              transition: "background-color 150ms ease-out, transform 150ms ease-out",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)")}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.transform = "none";
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 id="welcome-title" style={{ fontSize: 21, fontWeight: 500, color: TEXT, margin: 0, lineHeight: 1.25, letterSpacing: "-0.011em" }}>
              Lost something? Let&apos;s find it.
            </h2>
            <p id="welcome-desc" style={{ fontSize: 17, color: MUTED, fontWeight: 400, lineHeight: 1.45, margin: 0 }}>
              Three quick steps and it&apos;s back in your hands.
            </p>
          </div>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {STEPS.map((s, i) => {
              const isFirst = i === 0; // the one branded touch: first step's numeral
              return (
                <li key={s.n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: `1px solid ${isFirst ? brandColor : OUTLINE}`,
                      backgroundColor: "transparent",
                      color: isFirst ? brandColor : MUTED,
                      fontSize: 18,
                      fontWeight: 500,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {s.n}
                  </span>
                  <p style={{ fontSize: 21, fontWeight: 500, color: TEXT, margin: 0, lineHeight: 1.25, letterSpacing: "-0.011em" }}>
                    {s.title}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Primary action — near-black, not the brand color */}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              backgroundColor: TEXT,
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 500,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: FONT,
              letterSpacing: "-0.011em",
              transition: "background-color 150ms ease-out, transform 150ms ease-out",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = INK_HOVER)}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = TEXT;
              e.currentTarget.style.transform = "none";
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
          >
            Continue to items
          </button>

          {/* Discreet staff link — muted ghost link, subordinate */}
          <p style={{ textAlign: "center", margin: 0 }}>
            <Link
              href="/staff/login"
              style={{ fontSize: 12, fontWeight: 400, color: MUTED, textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Staff login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
