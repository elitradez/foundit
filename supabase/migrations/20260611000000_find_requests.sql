-- Migration: find_requests — committed descriptions for the describe-first
-- claim flow ("Find my item").
--
-- ANTI-FRAUD DESIGN: the student's description is committed server-side BEFORE
-- they see any matching items or unblurred photos. A claim that results from
-- the flow links back to this row, so staff can compare what the student said
-- (before seeing anything) against the item they ended up claiming. The row is
-- written once at search time and never updated.

create table if not exists public.find_requests (
  id uuid primary key default gen_random_uuid(),
  university_id text not null,
  description text not null,
  location_lost text,          -- optional: department/location the student chose
  date_lost date,              -- optional: when they think they lost it
  created_at timestamptz not null default now()
);

create index if not exists find_requests_created_at_idx on public.find_requests (created_at desc);

-- Deny-all RLS: only the service-role API reads/writes this table (same
-- posture as claims/alerts — see 20260506230000_tenant_rls_policies.sql).
alter table public.find_requests enable row level security;

-- Link claims to the committed description that preceded them.
alter table public.claims add column if not exists find_request_id uuid references public.find_requests(id);

create index if not exists claims_find_request_id_idx on public.claims (find_request_id);
