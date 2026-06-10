-- Migration: drop_legacy_foundit_table
-- (applied to the live campus DB on 2026-06-09 as "drop_legacy_foundit_table")
--
-- Drop the legacy "FoundIt" table: an early prototype of public.items left over
-- from initial project setup. Verified immediately before the drop: 0 rows,
-- no inbound foreign keys, referenced nowhere in the codebase (columns were
-- id, created_at, name, description, location, image_url, status,
-- claim_description, claim_email, pin — a pre-multi-tenant items draft).
-- It carried RLS-enabled/no-policies (deny-all) and only generated advisor noise.

DROP TABLE IF EXISTS public."FoundIt";
