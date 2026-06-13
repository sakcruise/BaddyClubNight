-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Friends Groups (Splitwise-style casual play)
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run
--   (Idempotent: safe to re-run — uses IF NOT EXISTS / CREATE OR REPLACE.)
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

-- Drop first so the whole file is safe to re-run.
DROP POLICY IF EXISTS "Owner manages own groups"        ON groups;
DROP POLICY IF EXISTS "Owner manages own group members" ON group_members;
DROP POLICY IF EXISTS "Owner manages own expenses"      ON expenses;
DROP POLICY IF EXISTS "Owner manages own expense shares" ON expense_shares;
DROP POLICY IF EXISTS "Owner manages own settlements"   ON settlements;
DROP POLICY IF EXISTS "Owner manages own rsvps"         ON session_rsvps;
DROP POLICY IF EXISTS "Member reads joined groups"      ON groups;
DROP POLICY IF EXISTS "Member reads co-members"         ON group_members;

-- Owner-scoped policies.
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

-- ── Membership reads: a joined member can see their group and its members ──────
CREATE POLICY "Member reads joined groups"
  ON groups FOR SELECT
  USING (EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = groups.id AND gm.member_user_id = auth.uid()));

CREATE POLICY "Member reads co-members"
  ON group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM group_members me WHERE me.group_id = group_members.group_id AND me.member_user_id = auth.uid()));

-- ── Invite / join by link ─────────────────────────────────────────────────────
-- SECURITY DEFINER so a friend who isn't (yet) a member can look up a group by its
-- invite token and add themselves — without exposing a blanket read policy on groups.

CREATE OR REPLACE FUNCTION public.get_group_by_invite(p_token TEXT)
RETURNS TABLE (id UUID, name TEXT, member_count BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id)
  FROM groups g
  WHERE g.invite_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.join_group(p_token TEXT, p_display_name TEXT, p_member_type TEXT DEFAULT 'male')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group UUID;
BEGIN
  SELECT id INTO v_group FROM groups WHERE invite_token = p_token;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;
  IF NULLIF(trim(coalesce(p_display_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A name is required to join';
  END IF;
  -- A logged-in user who already joined just gets the group id back (idempotent).
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM group_members WHERE group_id = v_group AND member_user_id = auth.uid()
  ) THEN
    RETURN v_group;
  END IF;
  INSERT INTO group_members (group_id, member_user_id, display_name, member_type, role)
  VALUES (v_group, auth.uid(), trim(p_display_name), COALESCE(NULLIF(p_member_type,''), 'male'), 'member');
  RETURN v_group;
END;
$$;

-- Anyone with the link can preview the group; both anon and signed-in can join
-- (anon joins are name-only, member_user_id stays NULL).
GRANT EXECUTE ON FUNCTION public.get_group_by_invite(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(TEXT, TEXT, TEXT) TO anon, authenticated;
