-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Drop redundant club_name column from accounts table
--
-- display_name already serves this purpose. club_name is never written to
-- by current code and can be removed.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.accounts DROP COLUMN IF EXISTS club_name;
