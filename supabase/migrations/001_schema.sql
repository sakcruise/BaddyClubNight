-- Supabase cloud schema — mirrors the SQLite schema

CREATE TABLE IF NOT EXISTS members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name   TEXT NOT NULL,
  date        DATE NOT NULL,
  num_courts  INTEGER NOT NULL DEFAULT 4,
  status      TEXT NOT NULL DEFAULT 'setup',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES members(id),
  position      INTEGER NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, member_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  court_id    INTEGER NOT NULL,
  team_a_1    UUID NOT NULL REFERENCES members(id),
  team_a_2    UUID NOT NULL REFERENCES members(id),
  team_b_1    UUID NOT NULL REFERENCES members(id),
  team_b_2    UUID NOT NULL REFERENCES members(id),
  score_a     INTEGER,
  score_b     INTEGER,
  result      TEXT NOT NULL DEFAULT 'pending',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

-- Row level security: public read for leaderboard, write only via service role
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read members"       ON members       FOR SELECT USING (true);
CREATE POLICY "Public read sessions"      ON sessions      FOR SELECT USING (true);
CREATE POLICY "Public read queue"         ON queue_entries FOR SELECT USING (true);
CREATE POLICY "Public read matches"       ON matches       FOR SELECT USING (true);
