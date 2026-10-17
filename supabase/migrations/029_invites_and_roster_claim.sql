-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 029: club invite links and roster matching
--
-- group_invites          link that expires (7 days), can be revoked, joins as Member,
--                        optional admin approval (default off)
-- members.user_id        a roster person linked to a login (set when they claim it)
-- group_memberships.claim_member_id   roster person a pending request says is them
--
-- Functions: create_group_invite, revoke_group_invite, list_group_invites,
--            preview_group_invite (works signed-out), find_my_roster_matches,
--            accept_group_invite, list_join_requests, review_join_request.
-- Roster matching: phone or email first, then exact name; the server re-checks the
-- match on accept, so nobody can claim a roster person who is not a match.
-- Additive. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_user ON public.members(user_id);
ALTER TABLE public.group_memberships ADD COLUMN IF NOT EXISTS claim_member_id UUID;

CREATE TABLE IF NOT EXISTS public.group_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  revoked_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON public.group_invites(group_id);
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;   -- no policies: functions only

-- ── create / revoke / list ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_group_invite(p_group UUID, p_requires_approval BOOLEAN DEFAULT false)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token TEXT;
BEGIN
  IF NOT has_group_permission(p_group, 'manage_members') THEN
    RAISE EXCEPTION 'You do not have permission to invite people';
  END IF;
  UPDATE group_invites SET revoked_at = now() WHERE group_id = p_group AND revoked_at IS NULL;
  v_token := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO group_invites (group_id, token, requires_approval, created_by)
  VALUES (p_group, v_token, COALESCE(p_requires_approval, false), auth.uid());
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, auth.uid(), 'invite_created', jsonb_build_object('requires_approval', COALESCE(p_requires_approval, false)));
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_group_invite(p_group UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_group_permission(p_group, 'manage_members') THEN
    RAISE EXCEPTION 'You do not have permission to manage invites';
  END IF;
  UPDATE group_invites SET revoked_at = now() WHERE group_id = p_group AND revoked_at IS NULL;
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, auth.uid(), 'invite_revoked', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_group_invites(p_group UUID)
RETURNS TABLE (token TEXT, requires_approval BOOLEAN, expires_at TIMESTAMPTZ, active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT has_group_permission(p_group, 'manage_members') THEN
    RAISE EXCEPTION 'You do not have permission to manage invites';
  END IF;
  RETURN QUERY
    SELECT i.token, i.requires_approval, i.expires_at, (i.revoked_at IS NULL AND i.expires_at > now())
    FROM group_invites i WHERE i.group_id = p_group ORDER BY i.created_at DESC LIMIT 5;
END;
$$;

-- ── what a person sees when they open the link (works signed out) ────────────
CREATE OR REPLACE FUNCTION public.preview_group_invite(p_token TEXT)
RETURNS TABLE (group_id UUID, name TEXT, kind TEXT, requires_approval BOOLEAN, state TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT g.id, g.name, g.kind, i.requires_approval,
         CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked'
              WHEN i.expires_at <= now() THEN 'expired' ELSE 'ok' END
  FROM group_invites i JOIN groups g ON g.id = i.group_id
  WHERE i.token = p_token;
$$;

-- ── roster matches for the signed-in person ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_my_roster_matches(p_token TEXT)
RETURNS TABLE (member_id UUID, name TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v_group UUID; v_email TEXT; v_phone TEXT; v_name TEXT;
BEGIN
  SELECT i.group_id INTO v_group FROM group_invites i
   WHERE i.token = p_token AND i.revoked_at IS NULL AND i.expires_at > now();
  IF v_group IS NULL THEN RAISE EXCEPTION 'This invite link is no longer valid'; END IF;
  SELECT lower(btrim(pr.email)), regexp_replace(COALESCE(pr.phone, ''), '\D', '', 'g'), lower(btrim(pr.display_name))
    INTO v_email, v_phone, v_name FROM profiles pr WHERE pr.user_id = auth.uid();
  RETURN QUERY
    SELECT m.id, m.name,
           CASE WHEN v_phone <> '' AND regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') = v_phone THEN 'phone'
                WHEN COALESCE(v_email, '') <> '' AND lower(btrim(COALESCE(m.email, ''))) = v_email THEN 'email'
                ELSE 'name' END
    FROM members m
    WHERE m.club_id = v_group AND m.user_id IS NULL AND COALESCE(m.active, true)
      AND (   (v_phone <> '' AND regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') = v_phone)
           OR (COALESCE(v_email, '') <> '' AND lower(btrim(COALESCE(m.email, ''))) = v_email)
           OR (COALESCE(v_name, '') <> '' AND lower(btrim(m.name)) = v_name))
    ORDER BY 3, m.name;
END;
$$;

-- shared by accept and approve: link a login to a roster person, only if it is a real match
CREATE OR REPLACE FUNCTION public._link_roster_member(p_group UUID, p_user UUID, p_member UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT; v_phone TEXT; v_name TEXT; m members%ROWTYPE;
BEGIN
  IF p_member IS NULL THEN RETURN; END IF;
  SELECT * INTO m FROM members WHERE id = p_member AND club_id = p_group AND user_id IS NULL;
  IF m.id IS NULL THEN RAISE EXCEPTION 'That roster person is not available to claim'; END IF;
  SELECT lower(btrim(pr.email)), regexp_replace(COALESCE(pr.phone, ''), '\D', '', 'g'), lower(btrim(pr.display_name))
    INTO v_email, v_phone, v_name FROM profiles pr WHERE pr.user_id = p_user;
  IF NOT (   (v_phone <> '' AND regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') = v_phone)
          OR (COALESCE(v_email, '') <> '' AND lower(btrim(COALESCE(m.email, ''))) = v_email)
          OR (COALESCE(v_name, '') <> '' AND lower(btrim(m.name)) = v_name)) THEN
    RAISE EXCEPTION 'That roster person does not match your details';
  END IF;
  UPDATE members SET user_id = p_user WHERE id = m.id;
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, p_user, 'roster_claimed', jsonb_build_object('member_id', m.id, 'name', m.name));
END;
$$;
REVOKE EXECUTE ON FUNCTION public._link_roster_member(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── accept an invite ─────────────────────────────────────────────────────────
-- Returns 'joined' or 'pending' (waiting for an admin).
CREATE OR REPLACE FUNCTION public.accept_group_invite(p_token TEXT, p_roster_member UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i group_invites%ROWTYPE; cur group_memberships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join'; END IF;
  SELECT * INTO i FROM group_invites WHERE token = p_token;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite link is no longer valid';
  END IF;

  SELECT * INTO cur FROM group_memberships WHERE group_id = i.group_id AND user_id = auth.uid();
  IF cur.id IS NOT NULL AND cur.status = 'active' THEN RETURN 'joined'; END IF;

  IF i.requires_approval THEN
    -- check the claim now so a bad one fails early; it is applied when an admin approves
    IF p_roster_member IS NOT NULL AND NOT EXISTS (SELECT 1 FROM find_my_roster_matches(p_token) r WHERE r.member_id = p_roster_member) THEN
      RAISE EXCEPTION 'That roster person does not match your details';
    END IF;
    IF cur.id IS NULL THEN
      INSERT INTO group_memberships (group_id, user_id, access, status, claim_member_id)
      VALUES (i.group_id, auth.uid(), 'member', 'invited', p_roster_member);
    ELSE
      UPDATE group_memberships SET status = 'invited', access = 'member', permissions = '{}', claim_member_id = p_roster_member WHERE id = cur.id;
    END IF;
    INSERT INTO group_activity (group_id, actor_user_id, action, detail)
    VALUES (i.group_id, auth.uid(), 'join_requested', jsonb_build_object('claim_member_id', p_roster_member));
    RETURN 'pending';
  END IF;

  IF cur.id IS NULL THEN
    INSERT INTO group_memberships (group_id, user_id, access, status) VALUES (i.group_id, auth.uid(), 'member', 'active');
  ELSE
    UPDATE group_memberships SET status = 'active', access = 'member', permissions = '{}' WHERE id = cur.id;
  END IF;
  PERFORM _link_roster_member(i.group_id, auth.uid(), p_roster_member);
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (i.group_id, auth.uid(), 'joined', jsonb_build_object('via', 'invite_link'));
  RETURN 'joined';
END;
$$;

-- ── join requests ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_join_requests(p_group UUID)
RETURNS TABLE (user_id UUID, display_name TEXT, email TEXT, claim_member_id UUID, claim_name TEXT, requested_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT has_group_permission(p_group, 'manage_members') THEN
    RAISE EXCEPTION 'You do not have permission to review requests';
  END IF;
  RETURN QUERY
    SELECT m.user_id, COALESCE(NULLIF(pr.display_name, ''), 'Someone'), pr.email, m.claim_member_id, r.name, m.created_at
    FROM group_memberships m
    LEFT JOIN profiles pr ON pr.user_id = m.user_id
    LEFT JOIN members r ON r.id = m.claim_member_id
    WHERE m.group_id = p_group AND m.status = 'invited'
    ORDER BY m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_join_request(p_group UUID, p_user UUID, p_approve BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur group_memberships%ROWTYPE;
BEGIN
  IF NOT has_group_permission(p_group, 'manage_members') THEN
    RAISE EXCEPTION 'You do not have permission to review requests';
  END IF;
  SELECT * INTO cur FROM group_memberships WHERE group_id = p_group AND user_id = p_user AND status = 'invited';
  IF cur.id IS NULL THEN RAISE EXCEPTION 'There is no pending request from that person'; END IF;
  IF p_approve THEN
    UPDATE group_memberships SET status = 'active', claim_member_id = NULL WHERE id = cur.id;
    BEGIN
      PERFORM _link_roster_member(p_group, p_user, cur.claim_member_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- claim no longer available; they still join, an admin can link them by hand
    END;
  ELSE
    UPDATE group_memberships SET status = 'revoked', claim_member_id = NULL WHERE id = cur.id;
  END IF;
  INSERT INTO group_activity (group_id, actor_user_id, action, detail)
  VALUES (p_group, auth.uid(), CASE WHEN p_approve THEN 'join_approved' ELSE 'join_declined' END, jsonb_build_object('user_id', p_user));
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'create_group_invite(uuid,boolean)', 'revoke_group_invite(uuid)', 'list_group_invites(uuid)',
    'find_my_roster_matches(text)', 'accept_group_invite(text,uuid)',
    'list_join_requests(uuid)', 'review_join_request(uuid,uuid,boolean)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
-- preview works signed out
GRANT EXECUTE ON FUNCTION public.preview_group_invite(TEXT) TO anon, authenticated;
