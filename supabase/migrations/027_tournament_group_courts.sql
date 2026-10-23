-- Courts used by the group stage for this tournament. NULL = all courts on the session.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS group_courts INTEGER;
