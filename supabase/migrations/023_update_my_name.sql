-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023: Let a person change their own display name
--
-- group_members rows are owner-managed (RLS), so a member can't rename
-- themselves in a group someone else runs. This function renames the caller
-- everywhere: every group_members row linked to them, plus their accounts row
-- when it's a friends-group account (a club account's display_name is the
-- club's name, so it's left alone).
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_my_name(p_name TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to change your name';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 40 THEN
    RAISE EXCEPTION 'Name must be 1 to 40 characters';
  END IF;

  UPDATE group_members SET display_name = v_name WHERE member_user_id = auth.uid();
  UPDATE accounts SET display_name = v_name WHERE user_id = auth.uid() AND account_type = 'group';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_my_name(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_name(TEXT) TO authenticated;
