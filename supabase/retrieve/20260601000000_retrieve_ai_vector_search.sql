-- Migration: retrieve_ai_vector_search   ***GYM TENANT ONLY — REVIEW BEFORE APPLYING***
--
-- TARGET DB : retrieve-gym-dev   ref tuqjckhmtlnyiqmxlroo
--             https://tuqjckhmtlnyiqmxlroo.supabase.co   (Postgres 17, us-east-2)
-- DO NOT APPLY TO CAMPUS: "Eli's Project" ref bsvjppgwmpiurqriclqm.
--
-- Lives under supabase/retrieve/ (NOT supabase/migrations/) on purpose: it must
-- never be picked up by the shared campus migration chain. Apply manually to the
-- gym DB only, via Supabase MCP apply_migration against tuqjckhmtlnyiqmxlroo.
--
-- WHAT THIS DOES
--   1. Installs the pgvector extension.
--   2. Adds tenant_id text (default 'livefitgym') to items + claims — tenant-ready.
--   3. Adds embedding vector(1536) to items (OpenAI text-embedding-3-small).
--   4. Adds a (tenant_id, status, created_at) btree for the tenant-scoped list path.
--   5. Adds an HNSW cosine index on items.embedding.
--   6. Creates search_items(): tenant-scoped pgvector kNN keyed on
--      tenant_id + status (+ optional category). NO campus university_id/returned_at.
--
-- ========================================================================
-- PHASE 1 HARDENING — MUST-FIX BEFORE MULTI-TENANT (tracked, intentionally
-- NOT done here while there is a single tenant):
--
--   (a) RLS policy "items public read" is currently USING (true), so any anon
--       caller can read EVERY row. With one tenant that is fine. The moment a
--       second tenant shares this DB it leaks cross-tenant. Replace it with a
--       tenant-scoped SELECT policy (match tenant_id against a JWT/session claim)
--       before onboarding tenant #2.
--
--   (b) search_items() is SECURITY INVOKER (see note at the function). That choice
--       depends on (a) being fixed: once the SELECT policy is tenant-scoped, the
--       function inherits it automatically as a second line of defense. Re-review
--       both together in Phase 1/2.
-- ========================================================================
--
-- REVERSIBLE: see the DOWN section at the bottom.
-- -------------------------------------------------------------------------


-- 1. pgvector --------------------------------------------------------------
create extension if not exists vector with schema extensions;


-- 2. tenant_id (NOT NULL default backfills the existing 12 rows in-place) ---
alter table public.items  add column if not exists tenant_id text not null default 'livefitgym';
alter table public.claims add column if not exists tenant_id text not null default 'livefitgym';


-- 3. embedding column ------------------------------------------------------
alter table public.items add column if not exists embedding extensions.vector(1536);


-- 4. tenant-scoped list index ----------------------------------------------
create index if not exists items_tenant_status_created_idx
  on public.items (tenant_id, status, created_at desc);


-- 5. HNSW cosine index on the embedding ------------------------------------
create index if not exists items_embedding_hnsw_idx
  on public.items using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);


-- 6. tenant-scoped vector search RPC ---------------------------------------
--    similarity = 1 - cosine_distance (higher = closer).
--
--    SECURITY MODEL — SECURITY INVOKER (the default; stated explicitly here):
--      Runs under the CALLER's privileges, so the items RLS policy still applies.
--      Verified safe today: the "items public read" policy USING (true) lets the
--      anon caller read the rows (and service_role bypasses RLS), so the function
--      returns correct results without DEFINER.
--
--      >>> MULTI-TENANT RISK <<<  Do NOT switch this to SECURITY DEFINER without a
--      re-review. A definer function bypasses RLS entirely, which would make the
--      in-function `tenant_id = match_tenant` filter the ONLY thing preventing
--      cross-tenant leaks. As INVOKER, the caller's RLS is a second layer on top
--      of that filter. Keep them both; revisit in Phase 1/2 alongside hardening (a).
--
--    The pinned search_path stays regardless of invoker/definer (satisfies the
--    function-search-path advisor and resolves the pgvector <=> operator).
create or replace function public.search_items(
  query_embedding extensions.vector(1536),
  match_tenant    text default 'livefitgym',
  filter_status   text default 'active',
  filter_category text default null,
  match_count     int  default 20
)
returns table (
  id          uuid,
  name        text,
  category    text,
  location    text,
  date_found  date,
  notes       text,
  photo_path  text,
  status      text,
  created_at  timestamptz,
  similarity  float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    i.id, i.name, i.category, i.location, i.date_found,
    i.notes, i.photo_path, i.status, i.created_at,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.items i
  where i.tenant_id = match_tenant
    and i.embedding is not null
    and (filter_status   is null or i.status   = filter_status)
    and (filter_category is null or i.category = filter_category)
  order by i.embedding <=> query_embedding
  limit greatest(1, least(match_count, 200));
$$;

grant execute on function public.search_items(extensions.vector, text, text, text, int)
  to anon, authenticated, service_role;


-- =========================================================================
-- DOWN (rollback) — paste into the gym DB SQL editor to revert
-- =========================================================================
-- drop function if exists public.search_items(extensions.vector, text, text, text, int);
-- drop index    if exists public.items_embedding_hnsw_idx;
-- drop index    if exists public.items_tenant_status_created_idx;
-- alter table public.items  drop column if exists embedding;
-- alter table public.items  drop column if exists tenant_id;
-- alter table public.claims drop column if exists tenant_id;
-- -- (leave the vector extension installed; harmless if other objects use it)
