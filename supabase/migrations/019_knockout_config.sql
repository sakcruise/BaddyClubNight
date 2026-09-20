-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 019: Knockout Round Configuration (points to play)
--
-- WHY:
--   Knockout rounds (Quarter-Final, Semi-Final, Final) may play to different
--   point targets (e.g., 11 for QF, 13 for SF, 15 for Final). Store this
--   configuration per tournament so the UI can display it and scoring can
--   enforce it.
--
-- HOW:
--   Add knockout_config JSON column to tournaments: { qf: 11, sf: 13, f: 15 }
--   or similar. Nullable so existing tournaments keep working.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS knockout_config JSONB DEFAULT '{"qf": 11, "sf": 13, "f": 15}';
