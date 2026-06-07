-- Clubs (one per registered organisation)
CREATE TABLE IF NOT EXISTS clubs (
  id            TEXT PRIMARY KEY,
  club_name     TEXT NOT NULL,
  admin_name    TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Members (scoped per club)
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  avatar_url  TEXT,
  member_type TEXT NOT NULL DEFAULT 'male',  -- male | female | guest
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions (scoped per club)
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  club_name   TEXT NOT NULL,
  date        TEXT NOT NULL,
  num_courts  INTEGER NOT NULL DEFAULT 4,
  status      TEXT NOT NULL DEFAULT 'setup',  -- setup | active | ended
  synced_at   TEXT,                           -- null = not yet synced to cloud
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Queue entries per session
CREATE TABLE IF NOT EXISTS queue_entries (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, member_id)
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  court_id    INTEGER NOT NULL,
  team_a_1    TEXT NOT NULL REFERENCES members(id),
  team_a_2    TEXT NOT NULL REFERENCES members(id),
  team_b_1    TEXT NOT NULL REFERENCES members(id),
  team_b_2    TEXT NOT NULL REFERENCES members(id),
  score_a     INTEGER,
  score_b     INTEGER,
  result      TEXT NOT NULL DEFAULT 'pending',  -- pending | complete
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_club    ON members(club_id);
CREATE INDEX IF NOT EXISTS idx_sessions_club   ON sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_queue_session   ON queue_entries(session_id, position);
CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id);
