# Design System

A techy, crisp visual language for the foundit / Laika Campus app, but more human than Vercel/Stripe. Clean white canvas, precise structure, humanist type, and one restrained use of the tenant's school color. Multi-tenant: the brand color is sourced per university from `getUniversityConfig().brandColor` (never hardcode a single brand color).

## Canvas

- **Clinical white** `#FFFFFF`. Crisp, precise, techy structure. No color walls, no large brand fills.

## Ink (text)

- **Primary**: near-black `#1F2328` (never pure black).
- **Secondary/muted**: grey `#62666D` (AA on white).

## Type

- **Work Sans** — a humanist sans; it carries the "human" feel. Weights **400 / 500** only.
- Slight **negative letter-spacing** (`-0.011em`) on large/heading text.
- No serif. Never reduce a text size below its current value when restyling.

## Geometry (rounded but not bubbly)

- **10px** on modals/dialogs.
- **8px** on cards.
- **6px** on buttons and inputs.
- **Full** on avatars/pills.
- Slightly rounder than pure-techy reads as friendlier.

## Accent

- The tenant's school color is **ONE restrained accent only** — the active/first step, a thin detail, or links. **Not** a fill, **not** a wall.
- **Primary actions are near-black `#1F2328`**, not the brand color, with white text.
- When a brand-tinted surface is genuinely needed, use 6–10% opacity, never a solid brand fill.

## Borders & Shadows

- Crisp **1px hairline borders** `rgba(0,0,0,0.06)`.
- For gentle depth, a **soft 2-layer shadow**:
  `box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 12px 28px rgba(0,0,0,0.1);`

## Motion (the human/techy line — lively but refined)

- **Hover**: 150ms ease-out.
- **Active/press**: `transform: scale(0.98)`.
- **Modal entrance**: opacity + `scale(0.97 → 1)` over ~200ms ease-out.
- Respect `prefers-reduced-motion`.
- **Focus**: a clearly visible focus ring (the app ships a global `:focus-visible` ring in brand via `app/globals.css`; keep it visible, never remove focus rings).

## Step indicators (ledger pattern)

- Steps render as a **numbered ledger**: plain numerals (`1.` `2.` `3.`, muted grey, regular weight, `tabular-nums`) in a narrow left column, with a bold title and a muted description line beside them.
- **Hairline rows**: a 1px `rgba(0,0,0,0.08)` divider above the first row, between every row, and below the last.
- **Never colored circles**, no icons, no per-row hover affordances. The numerals stay neutral — the brand color does not appear on steps.

## Brand color usage

- Against an otherwise fully neutral layout, the brand color is used **exactly once: on the primary action button** (solid fill, white text). This restraint is the point — no second brand element (not in the logo treatment, not on steps, not on links).

## Copy

- Warm and plain-spoken, never terse or robotic. **No em dashes.**

## Spacing

- Lay out on a **4px grid** (4 / 8 / 12 / 16 / 20 / 24 …), with generous whitespace.

## Accessibility (non-negotiable)

- Visual changes never alter logic, auth, data flow, or RLS.
- Preserve focus traps, ARIA dialog roles, keyboard navigation, and escape-to-close.
- Every text/background pairing must meet **WCAG AA** (≥4.5:1 normal text, ≥3:1 large). The white canvas makes this easy; confirm the accent on white and the near-black button both pass. If a shade fails, use the nearest compliant shade and flag it.
