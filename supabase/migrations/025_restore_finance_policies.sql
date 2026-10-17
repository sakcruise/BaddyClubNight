-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 025: Restore access rules on membership_dues and session_fees
--
-- Both tables had row level security switched on but NO policies, so nobody —
-- not even the club owner — could read or write dues or guest fees through the
-- app. Migration 019 meant to replace the old owner-only rules with
-- owner/treasurer rules (is_club_admin) but the replacement never landed.
--
-- This adds them: the club owner (club_id = auth.uid()), or an active
-- owner/treasurer in club_admins. A later migration swaps these for the
-- per-person permission check (has_group_permission).
--
-- Additive only: CREATE POLICY, guarded so it is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  op TEXT;
  pname TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['membership_dues', 'session_fees'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      pname := format('Club %s own %s', lower(op), t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = pname) THEN
        IF op = 'INSERT' THEN
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (club_id = auth.uid() OR public.is_club_admin(club_id, ARRAY[''owner'',''treasurer'']))',
            pname, t);
        ELSE
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR %s USING (club_id = auth.uid() OR public.is_club_admin(club_id, ARRAY[''owner'',''treasurer'']))',
            pname, t, op);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;
