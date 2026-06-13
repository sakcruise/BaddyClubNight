-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Scheduled group sessions + RSVP policies
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Add scheduling fields to sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS venue TEXT;

-- club_id must be nullable for group sessions (groups don't belong to a club)
ALTER TABLE public.sessions ALTER COLUMN club_id DROP NOT NULL;

-- upcoming status is stored as status='upcoming' (existing TEXT column)

-- Allow group owner to fully manage their group's sessions
DROP POLICY IF EXISTS "Owner manages group sessions" ON sessions;
CREATE POLICY "Owner manages group sessions"
  ON sessions FOR ALL
  USING (
    group_id IS NOT NULL AND
    EXISTS (SELECT 1 FROM groups WHERE id = sessions.group_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    group_id IS NOT NULL AND
    EXISTS (SELECT 1 FROM groups WHERE id = sessions.group_id AND owner_id = auth.uid())
  );

-- Allow group members (linked via member_user_id) to read their group's sessions
DROP POLICY IF EXISTS "Members read group sessions" ON sessions;
CREATE POLICY "Members read group sessions"
  ON sessions FOR SELECT
  USING (
    group_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = sessions.group_id
        AND gm.member_user_id = auth.uid()
    )
  );

-- Allow group members to manage their own RSVPs
DROP POLICY IF EXISTS "Members manage own rsvps" ON session_rsvps;
CREATE POLICY "Members manage own rsvps"
  ON session_rsvps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.id = session_rsvps.member_id
        AND gm.member_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.id = session_rsvps.member_id
        AND gm.member_user_id = auth.uid()
    )
  );

-- Allow owner to read all RSVPs for their group's sessions
DROP POLICY IF EXISTS "Owner reads group rsvps" ON session_rsvps;
CREATE POLICY "Owner reads group rsvps"
  ON session_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN groups g ON g.id = s.group_id
      WHERE s.id = session_rsvps.session_id
        AND g.owner_id = auth.uid()
    )
  );
