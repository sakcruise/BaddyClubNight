-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 020: Include RSVP names in list_group_sessions
--
-- list_group_sessions returned session_rsvps without display_name, and json_agg
-- produced NULL when nobody had responded — so the client mapped an empty list
-- and the group page never showed who said yes.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_group_sessions(p_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- Must be owner or member
  IF NOT (
    EXISTS (SELECT 1 FROM groups    WHERE id = p_group_id AND owner_id = v_caller) OR
    EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND member_user_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.scheduled_at ASC), '[]'::json)
    FROM (
      SELECT
        ses.id,
        ses.group_id,
        ses.club_name,
        ses.scheduled_at,
        ses.venue,
        ses.num_courts,
        ses.status,
        ses.created_at,
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
