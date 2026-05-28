"use client";

import Link from "next/link";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Single sans across the app (see DESIGN.md). Uses the app's --font-sans token.
const FONT = "var(--font-sans)";
const TEXT = "#1F2328"; // near-black, never pure black
const MUTED = "#656D76"; // muted text, AA on white (~5.2:1)
const HAIRLINE = "rgba(0,0,0,0.06)";
const OUTLINE = "rgba(0,0,0,0.18)"; // step numeral outline

type Props = {
  universityName: string;
  /** Tenant brand color sourced from getUniversityConfig().brandColor */
  brandColor: string;
  /** Tenant brand hover color sourced from getUniversityConfig().brandColorHover */
  brandColorHover: string;
  onClose: () => void;
};

/**
 * Returns a readable text color (dark or white) for a given hex background,
 * so the primary button stays accessible regardless of the tenant's brand color.
 */
function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#FFFFFF";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relative luminance (sRGB). Bright backgrounds get dark text.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? TEXT : "#FFFFFF";
}

const STEPS = [
  { n: 1, title: "Search for your item" },
  { n: 2, title: "Describe it to prove it's yours" },
  { n: 3, title: "Pick it up" },
];

export function WelcomeModal({ universityName, brandColor, brandColorHover, onClose }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const buttonTextColor = readableTextColor(brandColor);

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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
        className="anim-pop-in sm:items-center"
        style={{
          maxHeight: "92vh",
          width: "100%",
          maxWidth: 440,
          overflowY: "auto",
          backgroundColor: "#FFFFFF",
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 12,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 12px 24px rgba(0,0,0,0.1)",
          fontFamily: FONT,
          letterSpacing: "-0.011em",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: `1px solid ${HAIRLINE}`,
            padding: "20px 24px",
          }}
        >
          <div>
            <p
              style={{
                color: MUTED,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                lineHeight: 1.3,
                margin: "0 0 4px",
              }}
            >
              {universityName}
            </p>
            <h2 id="welcome-title" style={{ fontSize: 19, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: "-0.011em" }}>
              Lost something? Start here.
            </h2>
          </div>
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
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          <p id="welcome-desc" style={{ fontSize: 17, color: MUTED, fontWeight: 400, lineHeight: 1.4, margin: 0 }}>
            Get your item back in three steps.
          </p>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {STEPS.map((s) => (
              <li key={s.n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: `1px solid ${OUTLINE}`,
                    backgroundColor: "transparent",
                    color: MUTED,
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
            ))}
          </ol>

          {/* Primary action — the single brand-colored surface */}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              backgroundColor: brandColor,
              color: buttonTextColor,
              fontSize: 15,
              fontWeight: 500,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: FONT,
              letterSpacing: "-0.011em",
              transition: "background-color 150ms ease-out, transform 150ms ease-out",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brandColorHover)}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = brandColor;
              e.currentTarget.style.transform = "none";
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
          >
            Continue to items
          </button>

          {/* Discreet staff link — muted ghost text, not a button */}
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
