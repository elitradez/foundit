-- Migration: drop_public_storage_read
--
-- CONTEXT
-- Item photos live in the private "items" storage bucket and must only be
-- reachable through the Next.js service-role proxies (blurred for the public,
-- authenticated for staff). schema.sql drops the "Public read item photos"
-- policy on fresh installs, but a long-lived project may still carry a leftover
-- anon SELECT policy on storage.objects from an earlier setup — which would make
-- every original photo downloadable by anyone with the URL.
--
-- FIX
-- Idempotently drop any known public-read policy on storage.objects for the
-- items bucket. Safe to run repeatedly; no-op if the policies are already gone.
-- The bucket itself is also forced back to private.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read item photos"   ON storage.objects;
DROP POLICY IF EXISTS "Public Access"             ON storage.objects;
DROP POLICY IF EXISTS "Public read items bucket"  ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read items"     ON storage.objects;
-- The name actually found live on prod (see migration 20260610030000, which
-- applied this drop to the production DB):
DROP POLICY IF EXISTS "Public can view images"    ON storage.objects;

-- Ensure the bucket is not flagged public (public buckets bypass policies).
UPDATE storage.buckets SET public = false WHERE id = 'items';
