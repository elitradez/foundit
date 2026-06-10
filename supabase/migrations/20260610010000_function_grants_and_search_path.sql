-- Migration: function_grants_and_search_path
--
-- Fixes the Supabase security-advisor findings on the campus project:
--   1. purge_expired_pii()  — EXECUTE was granted to PUBLIC (and therefore
--      inherited by anon + authenticated).
--   2. search_items(...)    — EXECUTE granted to PUBLIC/anon/authenticated, and
--      the function (SECURITY DEFINER) had no pinned search_path.
--   3. public."FoundIt" / public.retention_log — RLS enabled with no policies:
--      verified intentional, documented below. No policies added.
--
-- VERIFIED AGAINST THE LIVE DB (project bsvjppgwmpiurqriclqm, 2026-06-09):
--   - purge_expired_pii() ACL was {=X/postgres, postgres=X/postgres,
--     service_role=X/postgres}; "=X" is the PUBLIC grant — revoking only from
--     anon/authenticated would be a no-op because they inherit via PUBLIC.
--   - The LIVE search_items signature is
--       (query_embedding vector, match_threshold double precision,
--        match_count integer, p_university_id uuid)
--     and returns full item rows. This DIFFERS from the stale definition in
--     supabase/schema.sql (p_university_id text, returns id+similarity only).
--     The live definition is reproduced verbatim below with one change: the
--     added `SET search_path = public`.
--
-- CALLERS (why these revokes are safe):
--   - On THIS database, search_items is called only from
--     app/api/items/search/route.ts via the service-role client. No campus
--     code uses the anon key at all, and no Supabase-auth ("authenticated")
--     sessions exist in this app. (app/retrieve/api/search/route.ts also calls
--     an rpc named search_items, but against the separate gym project
--     tuqjckhmtlnyiqmxlroo — out of scope for this migration.)
--   - purge_expired_pii is executed only by the nightly pg_cron job, which runs
--     as the function owner (postgres) and is unaffected by these revokes.
--
-- KNOWN DIVERGENCE (pre-existing, unchanged by this migration): the repo's
-- supabase/schema.sql items table predates the live one — it lacks the
-- embedding and image_url columns and declares university_id as text. The
-- function below codifies the LIVE definition; on a database built only from
-- the stale schema.sql it would error at first call until those columns exist.
-- -------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. search_items: pin search_path (advisor: "mutable search_path")
-- ---------------------------------------------------------------------------

-- The function's vector parameter type requires pgvector. No earlier file in
-- the migration chain creates it, so make the dependency explicit. No-op on
-- the live DB, where the extension already lives in public (deliberately not
-- moved — see advisor exclusions).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Defensively drop the stale text-signature overload from the historical
-- supabase/schema.sql. It is absent on the live DB (no-op there), but
-- schema.sql's header tells operators to re-run it in the SQL editor, and
-- doing so against the live DB (where items.embedding exists, so the CREATE
-- succeeds) would create an overload pair with identical parameter NAMES —
-- which PostgREST cannot disambiguate, silently breaking the search RPC.
-- schema.sql itself is amended in the same commit to remove that definition.
DROP FUNCTION IF EXISTS public.search_items(vector, double precision, integer, text);

CREATE OR REPLACE FUNCTION public.search_items(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 20,
  p_university_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  location text,
  image_url text,
  status text,
  date_found date,
  department_id uuid,
  university_id uuid,
  value_tier text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp last: without it, Postgres implicitly searches the caller's temp
-- schema FIRST, letting a session shadow "items" with a temp table.
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.description,
    i.location,
    i.image_url,
    i.status,
    i.date_found,
    i.department_id,
    i.university_id,
    i.value_tier,
    1 - (i.embedding <=> query_embedding) AS similarity
  FROM items i
  WHERE
    i.status = 'active'
    AND i.embedding IS NOT NULL
    AND (p_university_id IS NULL OR i.university_id = p_university_id)
    AND 1 - (i.embedding <=> query_embedding) > match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- NOTE: the vector extension lives in the public schema (deliberately not
-- moved — see advisor exclusions), so the <=> operator still resolves with
-- search_path pinned to public.


-- ---------------------------------------------------------------------------
-- 2. Function EXECUTE grants
--
-- PUBLIC must be revoked explicitly: anon and authenticated otherwise inherit
-- EXECUTE through it even after direct revokes. The advisor flagged only the
-- anon grant on search_items, but authenticated is equally unused (this app
-- has no Supabase-auth users), so it is revoked too. service_role keeps
-- EXECUTE — it is the only role the app uses to call search_items. postgres
-- retains rights as owner (pg_cron).
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.purge_expired_pii() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_expired_pii() TO service_role;

REVOKE EXECUTE ON FUNCTION public.search_items(vector, double precision, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_items(vector, double precision, integer, uuid)
  TO service_role;


-- ---------------------------------------------------------------------------
-- 3. public."FoundIt" and public.retention_log — RLS enabled, zero policies.
--
-- INTENTIONAL: deny-all is the desired posture for both. No policies added.
--
--   retention_log — internal audit table. Its only writers are
--     purge_expired_pii() (SECURITY DEFINER, owner postgres — bypasses RLS)
--     and app/api/admin/erasure/route.ts via the service-role client (BYPASSRLS).
--     Nothing reads it from the app; ops query it via the dashboard/SQL editor
--     as postgres. Anon/authenticated must see nothing. Already documented in
--     supabase/migrations/20260506230000_tenant_rls_policies.sql.
--
--   "FoundIt" — legacy table from early project setup, 0 rows, referenced
--     nowhere in the codebase. Deny-all keeps it inert. Candidate for a manual
--     DROP TABLE after a final content check; intentionally not dropped here.
-- ---------------------------------------------------------------------------

-- (no statements required for section 3)
