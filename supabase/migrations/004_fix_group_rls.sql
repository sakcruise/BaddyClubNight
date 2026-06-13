-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Fix infinite recursion (42P17) in group RLS
--
-- Migration 003's group/group_members policies referenced each other's tables
-- directly, so evaluating one policy triggered the other → infinite recursion,
-- and every SELECT on groups/group_members/expenses returned HTTP 500.
--
-- Fix: do the membership/ownership checks inside SECURITY DEFINER functions,
-- which run with RLS bypassed and therefore can't recurse.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. (Idempotent.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_owner(p_group UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM groups WHERE id = p_group AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group AND member_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_group_owner(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated;

-- ── Rebuild the recursive policies using the helpers ──────────────────────────
DROP POLICY IF EXISTS "Owner manages own groups"        ON groups;
DROP POLICY IF EXISTS "Member reads joined groups"      ON groups;
DROP POLICY IF EXISTS "Owner manages own group members" ON group_members;
DROP POLICY IF EXISTS "Member reads co-members"         ON group_members;

CREATE POLICY "Owner manages own groups"
  ON groups FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Member reads joined groups"
  ON groups FOR SELECT
  USING (public.is_group_member(id));

CREATE POLICY "Owner manages own group members"
  ON group_members FOR ALL
  USING (public.is_group_owner(group_id))
  WITH CHECK (public.is_group_owner(group_id));

CREATE POLICY "Member reads co-members"
  ON group_members FOR SELECT
  USING (public.is_group_member(group_id));

-- ── Also route the expenses/settlements/rsvps owner checks through the helper ──
-- (They read `groups`; using the function keeps them off the recursive path and
--  is cheaper than the inline EXISTS.)
DROP POLICY IF EXISTS "Owner manages own expenses"       ON expenses;
DROP POLICY IF EXISTS "Owner manages own expense shares" ON expense_shares;
DROP POLICY IF EXISTS "Owner manages own settlements"    ON settlements;
DROP POLICY IF EXISTS "Owner manages own rsvps"          ON session_rsvps;

CREATE POLICY "Owner manages own expenses"
  ON expenses FOR ALL
  USING (public.is_group_owner(group_id))
  WITH CHECK (public.is_group_owner(group_id));

CREATE POLICY "Owner manages own expense shares"
  ON expense_shares FOR ALL
  USING (EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_shares.expense_id AND public.is_group_owner(e.group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_shares.expense_id AND public.is_group_owner(e.group_id)));

CREATE POLICY "Owner manages own settlements"
  ON settlements FOR ALL
  USING (public.is_group_owner(group_id))
  WITH CHECK (public.is_group_owner(group_id));

CREATE POLICY "Owner manages own rsvps"
  ON session_rsvps FOR ALL
  USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_rsvps.session_id AND public.is_group_owner(s.group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_rsvps.session_id AND public.is_group_owner(s.group_id)));
