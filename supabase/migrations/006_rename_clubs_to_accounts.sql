-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Rename clubs → accounts
--
-- The `clubs` table was originally a username registry for club accounts only.
-- Now it holds personal/group accounts too, so "clubs" is misleading.
-- Renaming to `accounts` (a username → auth-email lookup for all account types).
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clubs RENAME TO accounts;
