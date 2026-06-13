-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Friends Groups (Splitwise-style casual play)
--
-- STATUS: NOT YET APPLIED. The current prototype runs friends-groups entirely on
-- the local engine (Zustand, same path as offline mode), so no backend changes
-- are required to click through the flow. Apply this when groups graduate from
-- prototype to multi-device / shared persistence.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run
--
-- MODEL: one person (auth.users) owns many groups. A group has its own members,
-- ad-hoc sessions, expenses, and RSVPs. A group_member is a name by default and
-- MAY later link to an auth user (member_user_id) for self check-in / RSVP.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Groups ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  venue         TEXT,
  num_courts    INTEGER NOT NULL DEFAULT 1,
  theme_key     TEXT NOT NULL DEFAULT 'orange',
  invite_token  TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Group members (name-only by default; optional linked account) ─────────────
CREATE TABLE IF NOT EXISTS group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name    TEXT NOT NULL,
  member_type     TEXT NOT NULL DEFAULT 'male',  -- male | female | guest
  skill_level     TEXT,                          -- optional, for fair matchmaking
  role            TEXT NOT NULL DEFAULT 'member',-- organiser | member
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Re-scope the existing play engine to groups ──────────────────────────────
-- sessions/queue/matches already have club_id; add a nullable group_id so a row
-- belongs to EITHER a club OR a group (exactly one is set).
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE matches       ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

-- ── Splitwise: expenses + shares + settlements ───────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',   -- court | shuttle | food | other
  amount       NUMERIC(10,2) NOT NULL,
  paid_by      UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  split_method TEXT NOT NULL DEFAULT 'equal',   -- equal | by_games | custom
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  share_amount  NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  to_member   UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  settled_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RSVP for ad-hoc sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_rsvps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'maybe',  -- yes | no | maybe
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_owner        ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group      ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group      ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_session       ON session_rsvps(session_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_rsvps  ENABLE ROW LEVEL SECURITY;

-- Owner-scoped policies. (A future revision can widen reads to members who have
-- joined via invite, using a membership lookup.)
CREATE POLICY "Owner manages own groups"
  ON groups FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner manages own group members"
  ON group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages own expenses"
  ON expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = expenses.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM groups g WHERE g.id = expenses.group_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages own expense shares"
  ON expense_shares FOR ALL
  USING (EXISTS (SELECT 1 FROM expenses e JOIN groups g ON g.id = e.group_id WHERE e.id = expense_shares.expense_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM expenses e JOIN groups g ON g.id = e.group_id WHERE e.id = expense_shares.expense_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages own settlements"
  ON settlements FOR ALL
  USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = settlements.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM groups g WHERE g.id = settlements.group_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages own rsvps"
  ON session_rsvps FOR ALL
  USING (EXISTS (SELECT 1 FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = session_rsvps.session_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = session_rsvps.session_id AND g.owner_id = auth.uid()));
