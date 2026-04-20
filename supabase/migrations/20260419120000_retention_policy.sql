-- Migration: 90-day automated PII retention policy
-- Enforces the DPA commitment to delete student PII after 90 days.
-- Targets: claims.created_at, alerts.created_at
-- Runs nightly at 03:00 America/Denver (09:00 UTC) via pg_cron.

-- ------------------------------------------------------------
-- 1. Audit log table (no PII — counts only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retention_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           timestamptz NOT NULL DEFAULT now(),
  claims_deleted   integer     NOT NULL DEFAULT 0,
  alerts_deleted   integer     NOT NULL DEFAULT 0,
  notes            text
);

-- ------------------------------------------------------------
-- 2. Purge function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_pii()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims_deleted  integer := 0;
  v_alerts_deleted  integer := 0;
  v_cutoff          timestamptz := now() - interval '90 days';
BEGIN
  -- Delete claims older than 90 days (all statuses — strictest DPA reading)
  DELETE FROM public.claims
  WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_claims_deleted = ROW_COUNT;

  -- Delete alerts older than 90 days
  DELETE FROM public.alerts
  WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_alerts_deleted = ROW_COUNT;

  -- Audit log entry (no PII)
  INSERT INTO public.retention_log (claims_deleted, alerts_deleted)
  VALUES (v_claims_deleted, v_alerts_deleted);

  RETURN format('deleted %s claims, %s alerts', v_claims_deleted, v_alerts_deleted);
END;
$$;

-- ------------------------------------------------------------
-- 3. Schedule: nightly 03:00 America/Denver = 09:00 UTC
-- ------------------------------------------------------------
SELECT cron.schedule(
  'purge-expired-pii',
  '0 9 * * *',
  $$SELECT public.purge_expired_pii();$$
);

-- ------------------------------------------------------------
-- DOWN migration (run manually if rollback needed):
-- ------------------------------------------------------------
-- SELECT cron.unschedule('purge-expired-pii');
-- DROP FUNCTION IF EXISTS public.purge_expired_pii();
-- DROP TABLE IF EXISTS public.retention_log;
