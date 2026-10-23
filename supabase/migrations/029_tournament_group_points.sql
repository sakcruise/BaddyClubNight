-- Points to win a group-stage match. NULL = 11.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS group_points INTEGER;
