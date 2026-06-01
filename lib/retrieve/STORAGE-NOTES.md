# Retrieve gym — storage / DB change log (retrieve-gym-dev)

These are changes applied directly to the **retrieve-gym-dev** Supabase project
(`tuqjckhmtlnyiqmxlroo`), not via the campus `supabase/migrations/` tree (which is
campus-shared). Recorded here so the gym surface has its own audit trail.

## 2026-06-01 — Drop wide-open public storage policies (single-tenant pilot)

**What:** dropped the two permissive `public` policies on `storage.objects` for the
`retrieve-item-photos` bucket:

```sql
drop policy if exists "retrieve photos read"   on storage.objects;  -- was: SELECT, role public
drop policy if exists "retrieve photos insert" on storage.objects;  -- was: INSERT, role public
```

(Bucket was already `public = false` from the earlier Phase 0 hardening.)

**Why:** the `public` SELECT policy let the anon/publishable key `createSignedUrl`
for — and the INSERT policy let it upload — any object in the bucket. Combined with
anon-readable item ids and deterministic paths (`{tenant}/{itemId}.ext`), that let a
sensitive-item photo (ID / wallet / phone) be signed without staff auth, bypassing the
app-layer gate. Dropping these closes that bypass.

**Result:** `storage.objects` now has zero policies → deny-all for anon/publishable.
All photo access (upload, sign, serve) flows **only** through the service-role server
routes (`app/retrieve/api/photo/[itemId]`, `app/retrieve/api/staff/items`,
`app/retrieve/api/claim`); service-role bypasses storage RLS. Verified end-to-end:
service-role upload/sign/fetch all 200; anon sign → masked "not found", anon upload →
RLS rejection.

**Follow-up (Phase 1/2):** replace this all-or-nothing posture with **tenant-scoped**
storage policies (per-`tenant_id` path prefix + staff-only sensitive prefix), enforced
via the per-request tenant JWT. See the RLS technical design.
