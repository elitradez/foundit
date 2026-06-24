"use client";

import Link from "next/link";
import { Work_Sans } from "next/font/google";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Work Sans (humanist sans). Self-hosted via next/font, scoped to this
// component so no change to app/layout.tsx is needed.
const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const FONT = workSans.style.fontFamily;

const TEXT = "#1A1A1A"; // near-black ink
const MUTED = "#6E6E6E"; // muted grey (AA on white, ~5.1:1)
const STAFF = "#767676"; // staff link grey — nearest AA-compliant to spec's #9A9A9A
const STAFF_HOVER = "#1A1A1A";
const BRAND = "#CC0000"; // school red — the single accent, white text passes AA (~5.9:1)
const BRAND_HOVER = "#B30000";
const HAIRLINE = "rgba(0,0,0,0.08)";

type Props = {
  universityName: string;
  /** Tenant brand color sourced from getUniversityConfig().brandColor */
  brandColor: string;
  /** Tenant brand hover color sourced from getUniversityConfig().brandColorHover */
  brandColorHover: string;
  onClose: () => void;
};

const STEPS = [
  { n: 1, title: "Search for your item", desc: "Browse what's been turned in across campus." },
  { n: 2, title: "Describe it to prove it's yours", desc: "A detail or two only the owner would know." },
  { n: 3, title: "Pick it up", desc: "Grab it from the nearest collection point." },
];

export function WelcomeModal({ universityName, onClose }: Props) {
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
          maxWidth: 460,
          overflowY: "auto",
          backgroundColor: "#FFFFFF",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.10)",
          fontFamily: FONT,
        }}
      >
        {/* 1. Header: institution name */}
        <div style={{ display: "flex", alignItems: "center", padding: "20px 24px" }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: TEXT, letterSpacing: "-0.005em" }}>
            {universityName}
          </span>
        </div>

        {/* 2. Full-width hairline divider */}
        <div style={{ height: 1, backgroundColor: HAIRLINE }} />

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* 3. Headline */}
          <h2
            id="welcome-title"
            style={{ fontSize: 28, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.12 }}
          >
            Lost something? Let&apos;s find it.
          </h2>
          {/* 4. Subhead */}
          <p id="welcome-desc" style={{ fontSize: 14, fontWeight: 400, color: MUTED, margin: "8px 0 0", lineHeight: 1.45 }}>
            Everything turned in across campus, in one place.
          </p>

          {/* 5. Numbered ledger list */}
          <ol
            style={{
              listStyle: "none",
              margin: "20px 0 0",
              padding: 0,
              borderBottom: `1px solid ${HAIRLINE}`,
            }}
          >
            {STEPS.map((s) => (
              <li
                key={s.n}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "13px 0",
                  borderTop: `1px solid ${HAIRLINE}`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 20,
                    fontSize: 15,
                    fontWeight: 400,
                    color: MUTED,
                    lineHeight: 1.3,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.n}.
                </span>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: 0, lineHeight: 1.3 }}>{s.title}</p>
                  <p style={{ fontSize: 13, fontWeight: 400, color: MUTED, margin: "2px 0 0", lineHeight: 1.4 }}>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* 6. Footer: centered primary button, staff link beneath */}
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: "inline-flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 48,
                backgroundColor: BRAND,
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                borderRadius: 9,
                cursor: "pointer",
                fontFamily: FONT,
                transition: "background-color 150ms ease-out, transform 150ms ease-out",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_HOVER)}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = BRAND;
                e.currentTarget.style.transform = "none";
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
            >
              Continue to items
              <span aria-hidden="true">&rarr;</span>
            </button>

            <Link
              href="/staff/login"
              style={{ fontSize: 12.5, fontWeight: 400, color: STAFF, textDecoration: "none", transition: "color 150ms ease-out" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = STAFF_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.color = STAFF)}
            >
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
