-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 021: Open / close the RSVP poll on a session
--
--   sessions.rsvp_open — true while the organiser is collecting replies.
--   rsvp_session()     — refuses replies once the poll is closed.
--   list_group_sessions() / get_session_rsvp_page() — return rsvp_open.
--
-- Supersedes 020's list_group_sessions (names + '[]' instead of NULL kept).
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS rsvp_open BOOLEAN NOT NULL DEFAULT true;

-- ── Members / organiser: list a group's sessions with RSVP names + poll state ─
CREATE OR REPLACE FUNCTION public.list_group_sessions(p_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM groups        WHERE id = p_group_id AND owner_id = v_caller) OR
    EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND member_user_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.scheduled_at ASC), '[]'::json)
    FROM (
      SELECT
        ses.id, ses.group_id, ses.club_name, ses.scheduled_at, ses.venue,
        ses.num_courts, ses.status, ses.created_at, ses.rsvp_open,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',          r.id,
            'member_id',   r.member_id,
            'member_name', gm.display_name,
            'status',      r.status
          ) ORDER BY gm.display_name)
          FROM session_rsvps r
          JOIN group_members gm ON gm.id = r.member_id
          WHERE r.session_id = ses.id
        ), '[]'::json) AS session_rsvps
      FROM sessions ses
      WHERE ses.group_id = p_group_id
        AND ses.status IN ('upcoming', 'active')
    ) s
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_group_sessions(UUID) TO authenticated;

-- ── Public RSVP page: include the poll state ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_session_rsvp_page(p_session_id UUID)
RETURNS JSON
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'id',            s.id,
    'group_name',    g.name,
    'scheduled_at',  s.scheduled_at,
    'venue',         s.venue,
    'num_courts',    s.num_courts,
    'status',        s.status,
    'rsvp_open',     s.rsvp_open,
    'members', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id',          gm.id,
          'name',        gm.display_name,
          'member_type', gm.member_type,
          'rsvp',        COALESCE(
            (SELECT sr.status FROM session_rsvps sr
             WHERE sr.session_id = p_session_id AND sr.member_id = gm.id),
            'no_response'
          )
        )
        ORDER BY gm.display_name
      ), '[]'::json)
      FROM group_members gm
      WHERE gm.group_id = s.group_id
    )
  )
  FROM sessions s
  JOIN groups g ON g.id = s.group_id
  WHERE s.id = p_session_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_session_rsvp_page(UUID) TO anon, authenticated;

-- ── Reply: refused once the poll is closed ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.rsvp_session(
  p_session_id UUID,
  p_member_id  UUID,
  p_status     TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('yes', 'no', 'maybe') THEN
    RAISE EXCEPTION 'Invalid RSVP status: %', p_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND rsvp_open) THEN
    RAISE EXCEPTION 'The poll for this session is closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
    JOIN sessions s ON s.group_id = gm.group_id
    WHERE gm.id = p_member_id AND s.id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Member does not belong to this session''s group';
  END IF;

  INSERT INTO session_rsvps (session_id, member_id, status)
  VALUES (p_session_id, p_member_id, p_status)
  ON CONFLICT (session_id, member_id)
    DO UPDATE SET status = EXCLUDED.status, responded_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.rsvp_session(UUID, UUID, TEXT) TO anon, authenticated;
