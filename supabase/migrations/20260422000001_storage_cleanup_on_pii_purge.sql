-- Migration: storage photo cleanup on PII purge (Phase 3 HECVAT)
-- claimed_items.photo_path stores student ID proof photos (PII).
-- Previously, purge_expired_pii() deleted claims rows and let CASCADE wipe
-- claimed_items, silently orphaning the storage objects in the `items` bucket.
-- This migration extends the retention_log schema and rewrites the purge
-- function to delete storage objects before the CASCADE fires.
--
-- Storage deletion mechanism: storage.objects rows are deleted directly.
-- The protect_objects_delete trigger requires storage.allow_delete_query='true'
-- — see migration 20260422000002 for the correction that adds this.
-- Deleting the storage.objects row removes all API access to the file
-- immediately; underlying S3 bytes are GC'd by Supabase's internal process.
--
-- Scope: claimed_items.photo_path only.
-- Out of scope: items.photo_path (separate PR), manual-delete trigger
-- (deferred until app supports manual deletes), bucket restructuring.

-- ------------------------------------------------------------
-- 1. Extend retention_log with storage outcome columns
-- ------------------------------------------------------------
ALTER TABLE public.retention_log
  ADD COLUMN IF NOT EXISTS storage_paths_deleted  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storage_delete_failures INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 2. Rewrite purge_expired_pii() to clean up storage objects
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_pii()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff               timestamptz := now() - interval '90 days';
  v_claims_deleted       integer     := 0;
  v_alerts_deleted       integer     := 0;
  v_paths                text[]      := '{}';
  v_paths_deleted        text[]      := '{}';
  v_storage_failures     integer     := 0;
  v_path                 text;
  v_rows_affected        integer;
BEGIN
  -- Collect photo paths from claimed_items BEFORE the cascade delete wipes them.
  -- The CTE joins through claims so we only touch rows that are actually expiring.
  WITH expiring_claims AS (
    SELECT id FROM public.claims WHERE created_at < v_cutoff
  )
  SELECT array_agg(ci.photo_path)
  INTO   v_paths
  FROM   public.claimed_items ci
  JOIN   expiring_claims ec ON ec.id = ci.claim_id
  WHERE  ci.photo_path IS NOT NULL AND ci.photo_path <> '';

  v_paths := COALESCE(v_paths, '{}');

  -- Opt in to direct storage.objects deletion for this transaction only.
  -- The protect_objects_delete trigger requires this flag; the Supabase Storage
  -- API sets it the same way before its own deletes.
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  -- Attempt to delete each storage object. Failures are logged loudly but do
  -- not abort the purge — we record them so ops can investigate and remediate.
  FOREACH v_path IN ARRAY v_paths LOOP
    BEGIN
      DELETE FROM storage.objects
      WHERE  bucket_id = 'items'
        AND  name      = v_path;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

      IF v_rows_affected = 0 THEN
        -- Object already absent — desired state achieved, note it anyway.
        RAISE WARNING 'purge_expired_pii: storage object not found (pre-existing orphan?): %', v_path;
      END IF;

      -- Count as deleted regardless: file is gone or was already gone.
      v_paths_deleted := v_paths_deleted || v_path;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'purge_expired_pii: FAILED to delete storage object "%" — % %',
        v_path, SQLSTATE, SQLERRM;
      v_storage_failures := v_storage_failures + 1;
    END;
  END LOOP;

  -- Delete expired claims; CASCADE handles claimed_items automatically.
  DELETE FROM public.claims WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_claims_deleted = ROW_COUNT;

  -- Delete expired alerts (no storage columns).
  DELETE FROM public.alerts WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_alerts_deleted = ROW_COUNT;

  -- Persist audit record.
  INSERT INTO public.retention_log (
    claims_deleted,
    alerts_deleted,
    storage_paths_deleted,
    storage_delete_failures
  ) VALUES (
    v_claims_deleted,
    v_alerts_deleted,
    v_paths_deleted,
    v_storage_failures
  );

  -- Surface failures clearly in the return string so any caller / cron log sees them.
  IF v_storage_failures > 0 THEN
    RETURN format(
      'deleted %s claims, %s alerts; storage: %s deleted, %s FAILED — check DB warnings',
      v_claims_deleted,
      v_alerts_deleted,
      cardinality(v_paths_deleted),
      v_storage_failures
    );
  END IF;

  RETURN format(
    'deleted %s claims, %s alerts; storage: %s paths deleted',
    v_claims_deleted,
    v_alerts_deleted,
    cardinality(v_paths_deleted)
  );
END;
$$;

-- ------------------------------------------------------------
-- DOWN migration (run manually if rollback needed):
-- ------------------------------------------------------------
-- ALTER TABLE public.retention_log
--   DROP COLUMN IF EXISTS storage_paths_deleted,
--   DROP COLUMN IF EXISTS storage_delete_failures;
--
-- Restore original purge_expired_pii() from migration 20260419120000_retention_policy.sql
