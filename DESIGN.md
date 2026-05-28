# Design System

A restrained, content-first visual language for the foundit / Laika Campus app, inspired by Linear and Vercel. The goal: near-black text on neutral surfaces, the university brand color used sparingly as an accent, generous-but-tight spacing, and quiet micro-interactions. Multi-tenant: the brand color is sourced per university from `getUniversityConfig().brandColor` (never hardcode a single brand color).

## Color

- **Text**: near-black `#1F2328` (never pure black). Muted/secondary text `#656D76` (AA on white, ~5.2:1).
- **Surfaces**: white `#FFFFFF` and neutral greys. No solid brand fills on large areas.
- **Brand**: the university color (e.g. U of U `#CC0000`) is an **accent only**. Follow 60/30/10 — at most ~10% of any view is brand, and the brand *surface* area in a given component should be ~3%. In practice the brand color appears on a single primary CTA and the focus ring.
- **Tinted brand backgrounds**: when a brand-tinted surface is needed, use 6–10% opacity of the brand color, never a solid brand fill.

## Type

- A **single clean sans-serif** across the whole app. Currently the system sans stack via the `--font-sans` CSS variable. (Future enhancement: load **Inter** via `next/font` for crisper small sizes — requires a change to `app/layout.tsx`, out of scope for a single-component task.)
- **No serif** anywhere.
- **Weights 400 / 500 only.** 400 for body and muted text, 500 for titles and emphasis. Avoid 600+.
- **Letter-spacing**: slight negative tracking `-0.011em` on body and larger text. Uppercase eyebrows/labels are the exception (positive tracking).
- **Never reduce a text size below its current value** when restyling; readability and AA come first.

## Radius

- **6px** on buttons, inputs, and cards.
- **12px** on modals/dialogs.
- **Full** (`9999px` / `50%`) on avatars and pills.

## Borders & Shadows

- Prefer **1px low-opacity borders** `rgba(0,0,0,0.06)` over heavy shadows.
- For elevation, use a **soft 2-layer shadow**:
  `box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 12px 24px rgba(0,0,0,0.1);`

## Micro-interactions

- **Hover**: 150ms ease-out transitions.
- **Active/press**: `transform: scale(0.98)`.
- **Focus**: a visible **2px focus ring in the brand color at ~40% opacity**, offset 2px. (The app currently ships a global `:focus-visible` ring in solid brand via `app/globals.css`; keep it clearly visible. Do not remove focus rings.)
- Respect `prefers-reduced-motion`.

## Step indicators

- **Thin 24px outlined numerals** — a 24px circle with a 1px neutral border and a muted numeral inside. **Not** solid colored circles. The brand color does not appear on step indicators.

## Spacing

- Lay out on a **4px grid** (4 / 8 / 12 / 16 / 20 / 24 …).

## Accessibility (non-negotiable)

- Visual changes must never alter logic, auth, data flow, or RLS.
- Preserve focus traps, ARIA dialog roles, keyboard navigation, and escape-to-close.
- Every text/background pairing (brand CTA, tinted surfaces) must meet **WCAG AA** contrast (≥4.5:1 normal text, ≥3:1 large). If a brand shade fails, use the nearest compliant shade and flag it.
