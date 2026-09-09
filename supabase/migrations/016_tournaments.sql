-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: Tournaments (level-balanced groups + round-robin + knockout)
--
-- WHY:
--   Club nights already support a single balanced match via auto-pick
--   (members.level, added in 015). This adds a whole-roster tournament mode:
--   split everyone checked in into level-balanced groups, pair each group into
--   doubles (strongest with weakest), round-robin within the group, then send
--   the top pair(s) per group into a single-elimination knockout.
--
--   tournament_fixtures is a SCHEDULING QUEUE, not a parallel matches table —
--   a fixture's team columns mirror matches' shape so generating fixtures is
--   simple, but a fixture only becomes a real match (and thus visible on a
--   court / in the leaderboard) once an admin assigns it to a free court,
--   which inserts a normal matches row and stamps fixture.match_id.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run.
--   (Idempotent: safe to re-run — IF NOT EXISTS / DROP POLICY IF EXISTS throughout.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name               TEXT NOT NULL DEFAULT 'Tournament',
  num_groups         INTEGER NOT NULL,
  advance_per_group  INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'groups',  -- groups | knockout | complete
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The seeded roster — one row per participant. seed is the snake-draft rank
-- within the whole tournament, so pairing/grouping is always reconstructible.
CREATE TABLE IF NOT EXISTS tournament_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  group_index   INTEGER NOT NULL,
  pair_index    INTEGER,   -- which doubles pair within the group (null = reserve/bye)
  seed          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_fixtures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL,       -- group | knockout
  group_index   INTEGER,             -- set for stage='group'
  round         INTEGER NOT NULL,
  seed          INTEGER,             -- bracket position within the round (knockout only)
  team_a_1      UUID REFERENCES members(id),
  team_a_2      UUID REFERENCES members(id),
  team_b_1      UUID REFERENCES members(id),
  team_b_2      UUID REFERENCES members(id),  -- nullable: later knockout rounds wait on both feeders
  match_id      UUID REFERENCES matches(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | active | complete
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament  ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_fixtures_tournament ON tournament_fixtures(tournament_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tournament             ON sessions(tournament_id);

ALTER TABLE tournaments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_fixtures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club manages own tournaments" ON tournaments;
DROP POLICY IF EXISTS "Club manages own tournament players" ON tournament_players;
DROP POLICY IF EXISTS "Club manages own tournament fixtures" ON tournament_fixtures;

CREATE POLICY "Club manages own tournaments" ON tournaments FOR ALL
  USING (club_id = auth.uid()) WITH CHECK (club_id = auth.uid());

CREATE POLICY "Club manages own tournament players" ON tournament_players FOR ALL
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_players.tournament_id AND t.club_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_players.tournament_id AND t.club_id = auth.uid()));

CREATE POLICY "Club manages own tournament fixtures" ON tournament_fixtures FOR ALL
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_fixtures.tournament_id AND t.club_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_fixtures.tournament_id AND t.club_id = auth.uid()));
