-- Migration: tenant_rls_policies
--
-- CONTEXT
-- Adds defense-in-depth SELECT-only RLS policies for the anon and
-- authenticated roles on all tenant-scoped data tables.
--
-- The app exclusively uses the Supabase service-role key, which bypasses RLS
-- automatically. These policies block any query that arrives via the published
-- NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g., direct REST API calls with the key
-- extracted from the browser bundle).
--
-- The JWT claim check uses auth.jwt() ->> 'university_id'. The app currently
-- uses a custom HMAC session token (not Supabase Auth), so auth.jwt() always
-- returns NULL today — NULL::uuid != any row value, meaning every policy is
-- effectively deny-all. The policies are structured for future JWT-based access
-- without requiring a second migration when that path is added.
--
-- TABLES COVERED
--   Direct university_id (uuid):  alerts, claims, departments, items, security_log
--   FK-joined university_id:      claimed_items (→ claims), student_info (→ claims),
--                                 surplus_and_salvage (→ items)
--   Tenant reference table:       universities (own-record SELECT only)
--   Excluded — deny-all correct:  retention_log (internal pg_cron audit data),
--                                 FoundIt (legacy, 0 rows)
--
-- REVERSIBLE: DROP POLICY statements in the DOWN section at the bottom.
-- -------------------------------------------------------------------------


-- -------------------------------------------------------------------------
-- 1. alerts — own-tenant rows
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT alerts" ON public.alerts;
CREATE POLICY "Tenant SELECT alerts"
  ON public.alerts
  FOR SELECT
  TO anon, authenticated
  USING (university_id = (auth.jwt() ->> 'university_id')::uuid);


-- -------------------------------------------------------------------------
-- 2. claims — own-tenant rows
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT claims" ON public.claims;
CREATE POLICY "Tenant SELECT claims"
  ON public.claims
  FOR SELECT
  TO anon, authenticated
  USING (university_id = (auth.jwt() ->> 'university_id')::uuid);


-- -------------------------------------------------------------------------
-- 3. departments — own-tenant rows
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT departments" ON public.departments;
CREATE POLICY "Tenant SELECT departments"
  ON public.departments
  FOR SELECT
  TO anon, authenticated
  USING (university_id = (auth.jwt() ->> 'university_id')::uuid);


-- -------------------------------------------------------------------------
-- 4. items — own-tenant rows
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT items" ON public.items;
CREATE POLICY "Tenant SELECT items"
  ON public.items
  FOR SELECT
  TO anon, authenticated
  USING (university_id = (auth.jwt() ->> 'university_id')::uuid);


-- -------------------------------------------------------------------------
-- 5. security_log — own-tenant rows
--    university_id is nullable; NULL != uuid so null rows remain hidden.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT security_log" ON public.security_log;
CREATE POLICY "Tenant SELECT security_log"
  ON public.security_log
  FOR SELECT
  TO anon, authenticated
  USING (university_id = (auth.jwt() ->> 'university_id')::uuid);


-- -------------------------------------------------------------------------
-- 6. claimed_items — no direct university_id; join through claims
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT claimed_items" ON public.claimed_items;
CREATE POLICY "Tenant SELECT claimed_items"
  ON public.claimed_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id            = claimed_items.claim_id
        AND c.university_id = (auth.jwt() ->> 'university_id')::uuid
    )
  );


-- -------------------------------------------------------------------------
-- 7. student_info — no direct university_id; join through claims
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT student_info" ON public.student_info;
CREATE POLICY "Tenant SELECT student_info"
  ON public.student_info
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id            = student_info.claim_id
        AND c.university_id = (auth.jwt() ->> 'university_id')::uuid
    )
  );


-- -------------------------------------------------------------------------
-- 8. surplus_and_salvage — no direct university_id; join through items
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT surplus_and_salvage" ON public.surplus_and_salvage;
CREATE POLICY "Tenant SELECT surplus_and_salvage"
  ON public.surplus_and_salvage
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id            = surplus_and_salvage.item_id
        AND i.university_id = (auth.jwt() ->> 'university_id')::uuid
    )
  );


-- -------------------------------------------------------------------------
-- 9. universities — own tenant record only
--    No university_id column; match on the primary key.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant SELECT universities" ON public.universities;
CREATE POLICY "Tenant SELECT universities"
  ON public.universities
  FOR SELECT
  TO anon, authenticated
  USING (id = (auth.jwt() ->> 'university_id')::uuid);


-- =========================================================================
-- DOWN (rollback) — paste into Supabase SQL editor if you need to revert
-- =========================================================================
--
-- DROP POLICY IF EXISTS "Tenant SELECT alerts"              ON public.alerts;
-- DROP POLICY IF EXISTS "Tenant SELECT claims"              ON public.claims;
-- DROP POLICY IF EXISTS "Tenant SELECT departments"         ON public.departments;
-- DROP POLICY IF EXISTS "Tenant SELECT items"               ON public.items;
-- DROP POLICY IF EXISTS "Tenant SELECT security_log"        ON public.security_log;
-- DROP POLICY IF EXISTS "Tenant SELECT claimed_items"       ON public.claimed_items;
-- DROP POLICY IF EXISTS "Tenant SELECT student_info"        ON public.student_info;
-- DROP POLICY IF EXISTS "Tenant SELECT surplus_and_salvage" ON public.surplus_and_salvage;
-- DROP POLICY IF EXISTS "Tenant SELECT universities"        ON public.universities;
