-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Add account_type to accounts table
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'club'
  CHECK (account_type IN ('club', 'group'));

-- Existing rows already defaulted to 'club' via the DEFAULT above.
-- Backfill from user_metadata for any group accounts that already exist.
UPDATE public.accounts a
SET account_type = 'group'
FROM auth.users u
WHERE u.id = a.user_id
  AND u.raw_user_meta_data->>'account_type' = 'group';
