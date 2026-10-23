-- Groups can be drafted and saved before the tournament is started. NULL = saved, not started.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
