-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Public session RSVP page
--
-- Two SECURITY DEFINER functions so anon users (no account) can:
--   1. Read a session's details + full member RSVP list
--   2. Submit / update their own RSVP by member_id
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Read a session for the public RSVP page ───────────────────────────────
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
    'members', (
      SELECT json_agg(
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
      )
      FROM group_members gm
      WHERE gm.group_id = s.group_id
    )
  )
  FROM sessions s
  JOIN groups g ON g.id = s.group_id
  WHERE s.id = p_session_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_session_rsvp_page(UUID) TO anon, authenticated;

-- ── 2. Submit / update an RSVP (validates member belongs to session's group) ──
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

  -- Verify member actually belongs to this session's group
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
