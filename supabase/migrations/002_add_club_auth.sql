-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Add club_id to all tables + Supabase Auth integration
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add club_id column to each table (nullable first so existing rows don't break)
ALTER TABLE members       ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE matches       ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Add member_type to members if missing (older migration may not have it)
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'male';

-- 3. Add synced_at to sessions (tracks last Pi sync)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- 4. Add score columns to matches if missing
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_a INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_b INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- ─── Drop old public-read-only policies ───────────────────────────────────────
DROP POLICY IF EXISTS "Public read members"  ON members;
DROP POLICY IF EXISTS "Public read sessions" ON sessions;
DROP POLICY IF EXISTS "Public read queue"    ON queue_entries;
DROP POLICY IF EXISTS "Public read matches"  ON matches;

-- ─── New RLS policies: each club sees only their own data ─────────────────────

-- Members
CREATE POLICY "Club read own members"
  ON members FOR SELECT
  USING (club_id = auth.uid());

CREATE POLICY "Club insert own members"
  ON members FOR INSERT
  WITH CHECK (club_id = auth.uid());

CREATE POLICY "Club update own members"
  ON members FOR UPDATE
  USING (club_id = auth.uid());

CREATE POLICY "Club delete own members"
  ON members FOR DELETE
  USING (club_id = auth.uid());

-- Sessions
CREATE POLICY "Club read own sessions"
  ON sessions FOR SELECT
  USING (club_id = auth.uid());

CREATE POLICY "Club insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (club_id = auth.uid());

CREATE POLICY "Club update own sessions"
  ON sessions FOR UPDATE
  USING (club_id = auth.uid());

CREATE POLICY "Club delete own sessions"
  ON sessions FOR DELETE
  USING (club_id = auth.uid());

-- Queue entries
CREATE POLICY "Club read own queue"
  ON queue_entries FOR SELECT
  USING (club_id = auth.uid());

CREATE POLICY "Club insert own queue"
  ON queue_entries FOR INSERT
  WITH CHECK (club_id = auth.uid());

CREATE POLICY "Club update own queue"
  ON queue_entries FOR UPDATE
  USING (club_id = auth.uid());

CREATE POLICY "Club delete own queue"
  ON queue_entries FOR DELETE
  USING (club_id = auth.uid());

-- Matches
CREATE POLICY "Club read own matches"
  ON matches FOR SELECT
  USING (club_id = auth.uid());

CREATE POLICY "Club insert own matches"
  ON matches FOR INSERT
  WITH CHECK (club_id = auth.uid());

CREATE POLICY "Club update own matches"
  ON matches FOR UPDATE
  USING (club_id = auth.uid());

CREATE POLICY "Club delete own matches"
  ON matches FOR DELETE
  USING (club_id = auth.uid());

-- ─── Public leaderboard view (optional — for sharing) ────────────────────────
-- If you want to keep a public leaderboard, uncomment these:
-- CREATE POLICY "Public read sessions"      ON sessions      FOR SELECT USING (true);
-- CREATE POLICY "Public read members"       ON members       FOR SELECT USING (true);
-- CREATE POLICY "Public read matches"       ON matches       FOR SELECT USING (true);
