-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Drop recovery_email column from accounts table
--
-- The email column now stores the real email for all account types.
-- Group accounts' Supabase auth email (synthetic @baddyapp.internal) is
-- derived from the username at runtime, never stored.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill: for any existing group accounts that stored real email in
-- recovery_email but synthetic in email, copy it over first.
UPDATE public.accounts
SET email = recovery_email
WHERE account_type = 'group'
  AND recovery_email IS NOT NULL
  AND recovery_email <> '';

ALTER TABLE public.accounts DROP COLUMN IF EXISTS recovery_email;
