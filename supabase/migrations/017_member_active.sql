-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: members.active
--
-- WHY:
--   Members can't be deleted once they have played - matches, queue entries
--   and tournament fixtures reference them (no cascade, by design, so history
--   is never silently lost). To take someone off the roster we mark them
--   inactive instead: they disappear from check-in, tournament setup and the
--   Members list, but their name still resolves in old results.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE members ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_members_active ON members(active);
