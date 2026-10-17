-- Test fixtures for the end-to-end tests (client/e2e). Safe to re-run.
-- Logins:  e2e_owner / e2e_admin / e2e_member   password: E2e-Test-Pass-1!
-- Data:    "E2E Test Group" (small group) owned by e2e_owner, with e2e_admin
--          (admin, Treasurer, manage_dues) and e2e_member (member).
-- Every id starts e2e00000- so it is easy to spot and to remove (teardown_e2e_users.sql).
DO $$
DECLARE
  u RECORD;
  g CONSTANT UUID := 'e2e00000-0000-4000-8000-0000000000a0';
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('e2e00000-0000-4000-8000-000000000001'::uuid, 'e2e_owner',  'E2E Owner'),
    ('e2e00000-0000-4000-8000-000000000002'::uuid, 'e2e_admin',  'E2E Admin'),
    ('e2e00000-0000-4000-8000-000000000003'::uuid, 'e2e_member', 'E2E Member')
  ) AS v(id, uname, dname) LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
            u.uname || '@baddyapp.internal', extensions.crypt('E2e-Test-Pass-1!', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('account_type', 'group', 'display_name', u.dname, 'admin_name', u.dname),
            now(), now(), '', '', '', '')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.uname || '@baddyapp.internal'),
            'email', now(), now(), now())
    ON CONFLICT DO NOTHING;

    INSERT INTO public.accounts (id, user_id, username, display_name, admin_name, email, account_type)
    VALUES (u.id, u.id, u.uname, u.dname, u.dname, u.uname || '@baddyapp.internal', 'group')
    ON CONFLICT (id) DO NOTHING;
    -- the insert leaves username empty here, and the login screen finds people by username
    UPDATE public.accounts SET username = u.uname WHERE id = u.id AND username IS DISTINCT FROM u.uname;

    INSERT INTO public.profiles (user_id, display_name, email)
    VALUES (u.id, u.dname, u.uname || '@baddyapp.internal')
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.groups (id, owner_id, name, num_courts, theme_key, invite_token, kind)
  VALUES (g, 'e2e00000-0000-4000-8000-000000000001', 'E2E Test Group', 2, 'orange', 'e2etestinvite0001', 'small')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.group_members (id, group_id, member_user_id, display_name, member_type, role) VALUES
    ('e2e00000-0000-4000-8000-0000000000b1', g, 'e2e00000-0000-4000-8000-000000000001', 'E2E Owner',  'male', 'owner'),
    ('e2e00000-0000-4000-8000-0000000000b2', g, 'e2e00000-0000-4000-8000-000000000002', 'E2E Admin',  'male', 'member'),
    ('e2e00000-0000-4000-8000-0000000000b3', g, 'e2e00000-0000-4000-8000-000000000003', 'E2E Member', 'male', 'member')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.group_memberships (group_id, user_id, access, title, permissions) VALUES
    (g, 'e2e00000-0000-4000-8000-000000000001', 'admin', NULL,
        ARRAY['manage_members','manage_dues','manage_sessions','send_messages','manage_costs','manage_access']),
    (g, 'e2e00000-0000-4000-8000-000000000002', 'admin', 'Treasurer', ARRAY['manage_dues','manage_costs']),
    (g, 'e2e00000-0000-4000-8000-000000000003', 'member', NULL, '{}')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- A club (kind = 'club') owned by e2e_owner, for invite-link and roster-claim tests.
  INSERT INTO public.groups (id, owner_id, name, num_courts, theme_key, invite_token, kind)
  VALUES ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000001', 'E2E Test Club', 2, 'orange', 'e2etestinvite0002', 'club')
  ON CONFLICT (id) DO NOTHING;
  -- A club's id is also a login id (members.club_id points at accounts, which points at auth.users),
  -- so the club needs its own login row. Owner of the groups row is e2e_owner.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  VALUES ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
          'e2e_club@baddyapp.internal', extensions.crypt('E2e-Test-Pass-1!', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"account_type":"club","display_name":"E2E Test Club"}',
          now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.accounts (id, user_id, display_name, account_type, admin_name, email)
  VALUES ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a1', 'E2E Test Club', 'club', 'E2E Owner', 'e2e_club@baddyapp.internal')
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.accounts SET username = 'e2e_club' WHERE id = 'e2e00000-0000-4000-8000-0000000000a1';
  INSERT INTO public.group_memberships (group_id, user_id, access, permissions)
  VALUES ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000001', 'admin',
          ARRAY['manage_members','manage_dues','manage_sessions','send_messages','manage_costs','manage_access'])
  ON CONFLICT (group_id, user_id) DO NOTHING;
END $$;
