-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Personal (friends-group) account support
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
--
-- WHAT IT DOES:
--   • Adds recovery_email to clubs table so personal accounts (which use a
--     synthetic Supabase auth email) can still reset their password.
--   • personal accounts use   username@baddyapp.internal  as their Supabase
--     auth email; clubs.email stores that synthetic address; clubs.recovery_email
--     stores the real human email for the reset flow.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS recovery_email TEXT;
