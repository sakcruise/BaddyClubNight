-- Migration 028: one list of every group and club the signed-in person is in,
-- with their role in each. Powers the home list and the switcher.
CREATE OR REPLACE FUNCTION public.list_my_groups()
RETURNS TABLE (group_id UUID, name TEXT, kind TEXT, access TEXT, title TEXT,
               is_owner BOOLEAN, people INTEGER)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT g.id, g.name, g.kind, m.access, m.title, (g.owner_id = m.user_id),
         (SELECT count(*)::int FROM group_memberships x WHERE x.group_id = g.id AND x.status = 'active')
  FROM group_memberships m
  JOIN groups g ON g.id = m.group_id
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY (g.owner_id = m.user_id) DESC, g.kind DESC, g.name;
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_groups() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_my_groups() TO authenticated;
