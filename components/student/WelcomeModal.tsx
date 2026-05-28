"use client";

import Link from "next/link";
import { useFocusTrap } from "@/lib/useFocusTrap";

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

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
  return luminance > 0.6 ? "#1a1a1a" : "#FFFFFF";
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
          maxWidth: 480,
          overflowY: "auto",
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E5",
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid #E5E5E5",
            padding: "18px 20px",
          }}
        >
          <div>
            <p
              style={{
                color: brandColor,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                lineHeight: 1.3,
                margin: "0 0 2px",
              }}
            >
              {universityName}
            </p>
            <h2 id="welcome-title" style={{ fontSize: 19, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
              Lost something? Start here.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close welcome dialog"
            style={{
              minHeight: 36,
              minWidth: 36,
              padding: "6px 12px",
              backgroundColor: "#FFFFFF",
              border: "1px solid #E5E5E5",
              borderRadius: 4,
              fontSize: 16,
              lineHeight: 1,
              color: "#333333",
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <p id="welcome-desc" style={{ fontSize: 17, color: "#1a1a1a", fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
            Get your item back in three steps.
          </p>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            {STEPS.map((s) => (
              <li key={s.n} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    backgroundColor: brandColor,
                    color: buttonTextColor,
                    fontSize: 18,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.n}
                </span>
                <p style={{ fontSize: 21, fontWeight: 700, color: "#1a1a1a", margin: 0, lineHeight: 1.25 }}>
                  {s.title}
                </p>
              </li>
            ))}
          </ol>

          {/* Primary action */}
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
              fontWeight: 600,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: FONT,
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brandColorHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brandColor)}
          >
            Continue to items
          </button>

          {/* Discreet staff link */}
          <p style={{ textAlign: "center", margin: "2px 0 0" }}>
            <Link
              href="/staff/login"
              style={{ fontSize: 12, color: "#888888", textDecoration: "none" }}
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
