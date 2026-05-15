-- Migration: fix_rls_policies
--
-- CONTEXT
-- The app exclusively uses the Supabase service-role key (createAdminSupabaseClient).
-- Service-role bypasses RLS automatically — it needs zero explicit policies.
-- NEXT_PUBLIC_SUPABASE_ANON_KEY is published in the browser bundle but is never
-- used by any application code path. The 9 existing policies all target the
-- {public} role (= anon), and most use qual=true — granting anyone who extracts
-- the anon key unrestricted read/write access to every table via the REST API.
--
-- FIX
-- Drop all 9 broken policies. No replacements are needed:
--   - service-role continues to bypass RLS for all API routes (no change)
--   - anon gets deny-all on every table (no policy = no access)
--
-- TABLES AFFECTED
--   alerts, claimed_items, claims, items, student_info,
--   surplus_and_salvage, universities
-- (departments, security_log, retention_log already have no anon policies — correct)
--
-- REVERSIBLE: rollback SQL is in the DOWN section at the bottom of this file.
-- -------------------------------------------------------------------------

-- 1. alerts
DROP POLICY IF EXISTS "Service role full access alerts" ON public.alerts;

-- 2. claimed_items
DROP POLICY IF EXISTS "Service role full access claimed_items" ON public.claimed_items;

-- 3. claims (two policies — one is a duplicate, both dropped)
DROP POLICY IF EXISTS "Service role full access claims"          ON public.claims;
DROP POLICY IF EXISTS "Service role has full access to claims"   ON public.claims;

-- 4. items (two policies)
DROP POLICY IF EXISTS "Public can view active items"  ON public.items;
DROP POLICY IF EXISTS "Service role has full access"  ON public.items;

-- 5. student_info
DROP POLICY IF EXISTS "Service role full access student_info" ON public.student_info;

-- 6. surplus_and_salvage
DROP POLICY IF EXISTS "Service role full access surplus" ON public.surplus_and_salvage;

-- 7. universities
DROP POLICY IF EXISTS "Public can view active universities" ON public.universities;


-- =========================================================================
-- DOWN (rollback) — paste into Supabase SQL editor if you need to revert
-- =========================================================================
--
-- CREATE POLICY "Service role full access alerts"
--   ON public.alerts FOR ALL TO public USING (true) WITH CHECK (true);
--
-- CREATE POLICY "Service role full access claimed_items"
--   ON public.claimed_items FOR ALL TO public USING (true);
--
-- CREATE POLICY "Service role full access claims"
--   ON public.claims FOR ALL TO public USING (true) WITH CHECK (true);
--
-- CREATE POLICY "Service role full access student_info"
--   ON public.student_info FOR ALL TO public USING (true);
--
-- CREATE POLICY "Service role full access surplus"
--   ON public.surplus_and_salvage FOR ALL TO public USING (true);
--
-- CREATE POLICY "Service role has full access"
--   ON public.items FOR ALL TO public USING (true) WITH CHECK (true);
--
-- CREATE POLICY "Public can view active items"
--   ON public.items FOR SELECT TO public USING (returned_at IS NULL);
--
-- CREATE POLICY "Public can view active universities"
--   ON public.universities FOR SELECT TO public USING (active = true);
