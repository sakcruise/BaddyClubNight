-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Fix RLS so group members can read sessions + all RSVPs
--
-- Problems fixed:
--   1. "Members read group sessions" used a raw group_members subquery instead
--      of the is_group_member() SECURITY DEFINER helper — this could recurse or
--      silently deny access depending on the RLS evaluation order.
--   2. "Members manage own rsvps" only allowed members to read their OWN rsvp,
--      so going_count was always wrong (or 0) for non-owners.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix sessions read policy for members ───────────────────────────────────
DROP POLICY IF EXISTS "Members read group sessions" ON sessions;

CREATE POLICY "Members read group sessions"
  ON sessions FOR SELECT
  USING (
    group_id IS NOT NULL AND public.is_group_member(group_id)
  );

-- ── 2. Allow members to read all RSVPs for their group's sessions ─────────────
--    (so going_count and the RSVP list are accurate for everyone, not just owner)
DROP POLICY IF EXISTS "Members manage own rsvps" ON session_rsvps;
DROP POLICY IF EXISTS "Members read group rsvps" ON session_rsvps;

-- Members can write (upsert) only their own RSVP
CREATE POLICY "Members manage own rsvps"
  ON session_rsvps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      JOIN sessions s ON s.id = session_rsvps.session_id
      WHERE gm.id = session_rsvps.member_id
        AND gm.member_user_id = auth.uid()
        AND public.is_group_member(s.group_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      JOIN sessions s ON s.id = session_rsvps.session_id
      WHERE gm.id = session_rsvps.member_id
        AND gm.member_user_id = auth.uid()
        AND public.is_group_member(s.group_id)
    )
  );

-- Members can read ALL RSVPs for sessions in their groups (for going_count)
CREATE POLICY "Members read group rsvps"
  ON session_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_rsvps.session_id
        AND s.group_id IS NOT NULL
        AND public.is_group_member(s.group_id)
    )
  );
