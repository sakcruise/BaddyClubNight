-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: SECURITY DEFINER function for listing group sessions
--
-- The "Members read group sessions" RLS policy in migration 010 uses a direct
-- subquery on group_members which can fail silently for joined members due to
-- the RLS evaluation chain.  This function bypasses that entirely by running
-- with elevated privileges, validating membership explicitly, then returning
-- sessions + RSVPs in one go.
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
    SELECT json_agg(row_to_json(s) ORDER BY s.scheduled_at ASC)
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
        (
          SELECT json_agg(json_build_object(
            'id',        r.id,
            'member_id', r.member_id,
            'status',    r.status
          ))
          FROM session_rsvps r
          WHERE r.session_id = ses.id
        ) AS session_rsvps
      FROM sessions ses
      WHERE ses.group_id = p_group_id
        AND ses.status IN ('upcoming', 'active')
    ) s
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_group_sessions(UUID) TO authenticated;
