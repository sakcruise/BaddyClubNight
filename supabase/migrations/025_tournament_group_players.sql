-- Tournaments can include friends-group members, whose IDs live in group_members
-- rather than members. Drop the foreign keys that pinned player IDs to members,
-- leaving the columns as plain UUIDs. No rows are changed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid IN ('tournament_players'::regclass, 'tournament_fixtures'::regclass)
      AND a.attname IN ('member_id', 'team_a_1', 'team_a_2', 'team_b_1', 'team_b_2')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
