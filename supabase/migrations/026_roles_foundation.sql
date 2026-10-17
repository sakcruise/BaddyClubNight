-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 026: Foundation for one login, groups and clubs, roles
--
--   profiles           one row per person (per login)
--   groups.kind        'small' | 'club' — a club is a group with club features
--   group_memberships  who belongs to which group, their access level
--                      (admin | member), an optional free-text title, and the
--                      features they may use (permissions)
--   group_activity     log of role / access / ownership changes
--   has_group_permission(), is_group_admin()   helpers for access rules
--
-- A club keeps working under its old id: each existing club account gets a
-- groups row whose id equals its old club_id (the owner's login id), so every
-- club_id column in the club tables keeps pointing at the right row.
--
-- Additive only. No existing table is changed except for one new column on
-- groups. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Read own profile') THEN
    CREATE POLICY "Read own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Update own profile') THEN
    CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Insert own profile') THEN
    CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

INSERT INTO public.profiles (user_id, display_name, email)
SELECT a.user_id, COALESCE(NULLIF(btrim(a.display_name), ''), a.admin_name, ''), a.email
FROM public.accounts a
WHERE a.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 2. groups.kind, and one groups row per existing club ─────────────────────
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'small';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_kind_check') THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_kind_check CHECK (kind IN ('small', 'club'));
  END IF;
END $$;

INSERT INTO public.groups (id, owner_id, name, num_courts, theme_key, invite_token, kind)
SELECT a.user_id, a.user_id,
       COALESCE(NULLIF(btrim(a.display_name), ''), a.username, 'Club'),
       1, 'orange',
       substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
       'club'
FROM public.accounts a
WHERE a.account_type = 'club' AND a.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ── 3. group_memberships ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access      TEXT NOT NULL DEFAULT 'member' CHECK (access IN ('admin', 'member')),
  title       TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id),
  CONSTRAINT group_memberships_permissions_check CHECK (
    permissions <@ ARRAY['manage_members','manage_dues','manage_sessions','send_messages','manage_costs','manage_access']::text[]
  )
);
CREATE INDEX IF NOT EXISTS idx_group_memberships_user  ON public.group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON public.group_memberships(group_id);
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;

-- ── 4. group_activity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_activity_group ON public.group_activity(group_id, created_at DESC);
ALTER TABLE public.group_activity ENABLE ROW LEVEL SECURITY;

-- ── 5. Helpers (SECURITY DEFINER so the policies below never recurse) ────────
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM groups WHERE id = p_group AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM group_memberships
                 WHERE group_id = p_group AND user_id = auth.uid()
                   AND status = 'active' AND access = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.has_group_permission(p_group UUID, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM groups WHERE id = p_group AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM group_memberships
                 WHERE group_id = p_group AND user_id = auth.uid()
                   AND status = 'active' AND p_perm = ANY (permissions));
$$;

REVOKE EXECUTE ON FUNCTION public.is_group_admin(UUID)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_group_permission(UUID, TEXT)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_group_admin(UUID)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_group_permission(UUID, TEXT)   TO authenticated;

-- ── 6. Read rules (writes go through functions added in later migrations) ────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_memberships' AND policyname='Read own or group memberships') THEN
    CREATE POLICY "Read own or group memberships" ON public.group_memberships FOR SELECT
      USING (user_id = auth.uid() OR public.is_group_admin(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_activity' AND policyname='Admins read activity') THEN
    CREATE POLICY "Admins read activity" ON public.group_activity FOR SELECT
      USING (public.is_group_admin(group_id));
  END IF;
END $$;

-- ── 7. Backfill memberships from what exists today ───────────────────────────
-- Owners: admin with every feature.
INSERT INTO public.group_memberships (group_id, user_id, access, permissions)
SELECT g.id, g.owner_id, 'admin',
       ARRAY['manage_members','manage_dues','manage_sessions','send_messages','manage_costs','manage_access']
FROM public.groups g
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Friends-group members who are linked to a login: plain members.
INSERT INTO public.group_memberships (group_id, user_id, access)
SELECT DISTINCT gm.group_id, gm.member_user_id, 'member'
FROM public.group_members gm
WHERE gm.member_user_id IS NOT NULL
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Existing club admins: admin, with the features their old role implies.
INSERT INTO public.group_memberships (group_id, user_id, access, title, permissions)
SELECT ca.club_id, ca.user_id, 'admin', initcap(ca.role),
       CASE ca.role
         WHEN 'treasurer' THEN ARRAY['manage_dues','manage_costs']
         WHEN 'secretary' THEN ARRAY['manage_members','send_messages']
         ELSE ARRAY['manage_members','manage_dues','manage_sessions','send_messages','manage_costs','manage_access']
       END
FROM public.club_admins ca
WHERE ca.status = 'active'
  AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = ca.club_id)
ON CONFLICT (group_id, user_id) DO NOTHING;
