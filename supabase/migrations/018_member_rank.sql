-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018: members.rank
--
-- WHY:
--   The club keeps a full playing-strength order (1 = strongest). Levels
--   (1..6) are the coarse bands used for display and pairing; rank breaks
--   ties inside a level so the draft doesn't fall back to alphabetical order.
--   NULL = not ranked yet (sorted after ranked players of the same level).
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE members ADD COLUMN IF NOT EXISTS rank INTEGER;
