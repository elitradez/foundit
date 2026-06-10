# Foundit — University Lost & Found

A Next.js (App Router) application for running a university lost-and-found. Staff
log found items with a photo; students search a public catalog where photos are
blurred until they describe an item well enough to unblur it, then submit a
claim. Students can also text the service to be notified by SMS when a matching
item is logged. Final handoff is always verified in person.

> **Note for contributors and agents:** this repo pins a Next.js version with
> conventions that differ from older releases. Read the relevant guide under
> `node_modules/next/dist/docs/` before changing routing, params, proxy, or
> caching behavior. See `AGENTS.md`.

## Stack

- **Next.js 16 / React 19** — App Router, server route handlers under `app/api/`.
- **Supabase** — Postgres + private storage bucket for photos. All access goes
  through the service-role key in server code; the schema relies on deny-all RLS
  for anon (see `supabase/schema.sql` and `supabase/migrations/`).
- **Anthropic + OpenAI** — claim/alert matching and item embeddings for search.
- **Twilio** — inbound SMS alerts and outbound match notifications.
- **Upstash Redis** (optional) — shared rate-limit store; an in-memory fallback
  is used when it is not configured.
- **Sentry** — error monitoring, configured to exclude PII.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

### Required environment variables

Startup validation runs in `lib/env.ts`; in production a missing/invalid value
aborts boot. Minimum set:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_UNIVERSITY_ID` | University UUID; scopes all data. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client config. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only DB/storage access. |
| `STAFF_SESSION_SECRET` | 32+ chars; signs staff session cookies. |
| `ADMIN_API_SECRET` | 32+ chars; gates `/api/admin/*` and the deep health check. |
| `ANTHROPIC_API_KEY` | AI matching. |
| `OPENAI_API_KEY` | Item embeddings / semantic search. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS + webhook signature verification. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional; shared rate limiting. |

Public branding (`NEXT_PUBLIC_UNIVERSITY_NAME`, `NEXT_PUBLIC_BRAND_COLOR`,
`NEXT_PUBLIC_PICKUP_LOCATION`, `NEXT_PUBLIC_SITE_URL`) is optional and falls back
to defaults in `lib/university-config.ts`.

### Database

Apply `supabase/schema.sql`, then the files in `supabase/migrations/` in
timestamp order.

## Scripts

- `npm run dev` — start the dev server.
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — ESLint.
- `npm test` — Vitest unit tests.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and tests on every push and
pull request.

## Data handling

This app processes student PII (names, contact details, photos). Claims and SMS
alerts are auto-deleted 90 days after creation via a scheduled Postgres job, and
`/api/admin/erasure` performs on-request right-to-erasure. See `app/privacy`,
`docs/data-erasure.md`, and `docs/hecvat.md`.
