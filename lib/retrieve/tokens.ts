/**
 * Retrieve gym design tokens.
 *
 * Source of truth is the HSL spec; these hex values are the exact conversions,
 * exposed for inline styles. The same tokens are declared as CSS variables
 * scoped to `.retrieve-root` in app/retrieve/retrieve.css.
 *
 * CONTRAST NOTE (WCAG AA):
 *   --primary 20 90% 50% = #F2590D. White text on it = 3.37:1 — FAILS AA for
 *   normal text (passes only as large text). So white-on-orange BUTTONS use the
 *   darkened --primary-strong 20 90% 42% = #CB4B0B → white = 4.60:1 (AA pass).
 *   The bright #F2590D is reserved for the wordmark (large display), the record
 *   button, and non-text accents where the 4.5:1 rule does not apply.
 */

export const T = {
  background: "#FFFFFF", //  0 0% 100%
  foreground: "#121212", //  0 0% 7%
  primary: "#F2590D", //     20 90% 50%  — brand accent / wordmark / record button
  primaryStrong: "#CB4B0B", // 20 90% 42% — white-on-orange BUTTONS (AA 4.60:1)
  primaryForeground: "#FFFFFF",
  hero: "#121212", //        0 0% 7%   — dark surfaces (camera box)
  heroForeground: "#FFFFFF",
  muted: "#F2F2F2", //       0 0% 95%
  mutedForeground: "#666666", // 0 0% 40%
  border: "#E0E0E0", //      0 0% 88%
  radius: 16, //             --radius 1rem
  // Soft shadow used on cards.
  cardShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
  cardShadowHover: "0 4px 12px rgba(0,0,0,0.10), 0 12px 28px rgba(0,0,0,0.08)",
  fontDisplay: 'var(--font-display, "Space Grotesk", ui-sans-serif, system-ui, sans-serif)',
  fontBody: 'var(--font-body, "DM Sans", ui-sans-serif, system-ui, sans-serif)',
  // Translucent orange for focus rings / soft fills.
  primarySoft: "rgba(242,89,13,0.12)",
} as const;
