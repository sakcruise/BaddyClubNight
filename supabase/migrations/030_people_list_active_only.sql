-- Migration 030: list_group_people shows only active people (pending join requests
-- have their own list, list_join_requests).
CREATE OR REPLACE FUNCTION public.list_group_people(p_group UUID)
RETURNS TABLE (user_id UUID, display_name TEXT, email TEXT, access TEXT, title TEXT,
               permissions TEXT[], status TEXT, is_owner BOOLEAN, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT (is_group_admin(p_group) OR EXISTS (
        SELECT 1 FROM group_memberships m WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.status = 'active')) THEN
    RAISE EXCEPTION 'You are not in this group';
  END IF;
  RETURN QUERY
    SELECT m.user_id, COALESCE(NULLIF(pr.display_name, ''), 'Member'),
           CASE WHEN is_group_admin(p_group) THEN pr.email ELSE NULL END,
           m.access, m.title, m.permissions, m.status,
           (g.owner_id = m.user_id), m.created_at
    FROM group_memberships m
    JOIN groups g ON g.id = m.group_id
    LEFT JOIN profiles pr ON pr.user_id = m.user_id
    WHERE m.group_id = p_group AND m.status = 'active'
    ORDER BY (g.owner_id = m.user_id) DESC, (m.access = 'admin') DESC, pr.display_name;
END;
$$;
