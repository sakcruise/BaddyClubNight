-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 027: per-person permissions drive access; role-change functions
--
-- 1. Extra row-level rules (policies are OR-ed, so existing owner rules stay):
--      manage_dues      → membership_dues, session_fees, membership_plans
--      manage_members   → members, member_notes
--      manage_sessions  → sessions, queue_entries, matches, tournaments (+ children)
--    Any admin may read members/sessions/queue/matches of the group.
-- 2. Functions: list_group_people, set_member_access, remove_group_person.
--    Rules: owner always allowed; others need manage_access; nobody changes own
--    access; only the owner changes an admin's access or removes an admin; only
--    the owner can grant manage_access; the owner row cannot be touched.
--    Every change is logged in group_activity.
-- Additive. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  pname TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('membership_dues',  'manage_dues'),
    ('session_fees',     'manage_dues'),
    ('membership_plans', 'manage_dues'),
    ('members',          'manage_members'),
    ('member_notes',     'manage_members'),
    ('sessions',         'manage_sessions'),
    ('queue_entries',    'manage_sessions'),
    ('matches',          'manage_sessions'),
    ('tournaments',      'manage_sessions')
  ) AS v(t, perm) LOOP
    pname := 'Permitted manage ' || r.t;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.t AND policyname=pname) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.has_group_permission(club_id, %L)) WITH CHECK (public.has_group_permission(club_id, %L))',
        pname, r.t, r.perm, r.perm);
    END IF;
    pname := 'Admins read ' || r.t;
    IF r.t IN ('members','sessions','queue_entries','matches')
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.t AND policyname=pname) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_group_admin(club_id))',
        pname, r.t);
    END IF;
  END LOOP;
END $$;

-- Tournament children follow their tournament.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tournament_fixtures' AND policyname='Permitted manage tournament_fixtures') THEN
    CREATE POLICY "Permitted manage tournament_fixtures" ON public.tournament_fixtures FOR ALL
      USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND public.has_group_permission(t.club_id, 'manage_sessions')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND public.has_group_permission(t.club_id, 'manage_sessions')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tournament_players' AND policyname='Permitted manage tournament_players') THEN
    CREATE POLICY "Permitted manage tournament_players" ON public.tournament_players FOR ALL
      USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND public.has_group_permission(t.club_id, 'manage_sessions')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND public.has_group_permission(t.club_id, 'manage_sessions')));
  END IF;
END $$;

-- ── People list (names come from profiles, which are private per person) ─────
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
    WHERE m.group_id = p_group AND m.status <> 'revoked'
    ORDER BY (g.owner_id = m.user_id) DESC, (m.access = 'admin') DESC, pr.display_name;
END;
$$;

-- ── Change someone's access / title / features ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_access(
  p_group UUID, p_user UUID, p_access TEXT, p_title TEXT, p_permissions TEXT[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID; v_is_owner BOOLEAN; v_old group_memberships%ROWTYPE; v_perms TEXT[];
BEGIN
  SELECT owner_id INTO v_owner FROM groups WHERE id = p_group;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  v_is_owner := (v_owner = auth.uid());
  IF NOT has_group_permission(p_group, 'manage_access') THEN
    RAISE EXCEPTION 'You do not have permission to change access';
  END IF;
  IF p_user = v_owner THEN RAISE EXCEPTION 'The owner''s access cannot be changed'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access'; END IF;
  IF p_access NOT IN ('admin', 'member') THEN RAISE EXCEPTION 'Access must be admin or member'; END IF;

  SELECT * INTO v_old FROM group_memberships WHERE group_id = p_group AND user_id = p_user AND status = 'active';
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'That person is not in this group'; END IF;
  IF v_old.access = 'admin' AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Only the owner can change an admin''s access';
  END IF;

  v_perms := CASE WHEN p_access = 'admin' THEN COALESCE(p_permissions, '{}') ELSE '{}' END;
  IF 'manage_access' = ANY (v_perms) AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Only the owner can let someone change access';
  END IF;

  UPDATE group_memberships
     SET access = p_access, title = NULLIF(btrim(COALESCE(p_title, '')), ''), permissions = v_perms
   WHERE id = v_old.id;

  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, auth.uid(), 'access_changed', jsonb_build_object(
    'user_id', p_user,
    'from', jsonb_build_object('access', v_old.access, 'title', v_old.title, 'permissions', v_old.permissions),
    'to',   jsonb_build_object('access', p_access, 'title', NULLIF(btrim(COALESCE(p_title, '')), ''), 'permissions', v_perms)));
END;
$$;

-- ── Remove someone from the group (kept as a 'revoked' row for the log) ──────
CREATE OR REPLACE FUNCTION public.remove_group_person(p_group UUID, p_user UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID; v_old group_memberships%ROWTYPE;
BEGIN
  SELECT owner_id INTO v_owner FROM groups WHERE id = p_group;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  IF p_user = v_owner THEN RAISE EXCEPTION 'The owner cannot be removed. Transfer ownership first'; END IF;
  SELECT * INTO v_old FROM group_memberships WHERE group_id = p_group AND user_id = p_user AND status = 'active';
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'That person is not in this group'; END IF;
  IF p_user = auth.uid() THEN
    NULL; -- anyone may leave
  ELSIF v_old.access = 'admin' THEN
    IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Only the owner can remove an admin'; END IF;
  ELSIF NOT (has_group_permission(p_group, 'manage_members') OR has_group_permission(p_group, 'manage_access')) THEN
    RAISE EXCEPTION 'You do not have permission to remove people';
  END IF;
  UPDATE group_memberships SET status = 'revoked', permissions = '{}', access = 'member' WHERE id = v_old.id;
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, auth.uid(), CASE WHEN p_user = auth.uid() THEN 'left' ELSE 'removed' END,
          jsonb_build_object('user_id', p_user, 'was', v_old.access));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_group_people(UUID)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_access(UUID, UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_person(UUID, UUID)                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_group_people(UUID)                          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_member_access(UUID, UUID, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_group_person(UUID, UUID)                  TO authenticated;
