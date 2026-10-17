-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 031: in a friends group, only the person can change their own name.
--
-- The organiser may still add and remove members, and may edit the name of a
-- placeholder member (no login yet). A person with a login renames themselves
-- through update_my_name. Club data is untouched.
-- ─────────────────────────────────────────────────────────────────────────────
-- Applied in two steps because the DROP times out through the MCP connector:
-- 1) create the policies below, 2) run the DROP in the Supabase SQL Editor.
CREATE POLICY "Owner adds group members" ON public.group_members FOR INSERT
  WITH CHECK (public.is_group_owner(group_id));

DROP POLICY IF EXISTS "Owner manages own group members" ON public.group_members;

CREATE POLICY "Owner removes group members" ON public.group_members FOR DELETE
  USING (public.is_group_owner(group_id));

CREATE POLICY "Owner edits placeholder members only" ON public.group_members FOR UPDATE
  USING (public.is_group_owner(group_id) AND member_user_id IS NULL)
  WITH CHECK (public.is_group_owner(group_id) AND member_user_id IS NULL);
