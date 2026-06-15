-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Bring group sessions onto the online play engine
--
-- WHY:
--   Group sessions used to run entirely on the local (Zustand) engine because the
--   queue/match tables hard-reference members(id), while group rosters live in
--   group_members(id). That FK mismatch — not a missing feature — is why groups
--   couldn't write queue/match rows to Supabase.
--
--   This migration loosens those FKs so a player id can be EITHER a club member
--   or a group member, and adds owner/member RLS on queue_entries + matches for
--   group rows. After this, group nights run on the same Supabase path as clubs,
--   enabling multi-device live play. Names are resolved client-side (from the
--   loaded roster), so dropping the FK loses no functional integrity.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run.
--   (Idempotent: safe to re-run — DROP IF EXISTS / IF NOT EXISTS throughout.)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Safety columns (no-ops if already present) ────────────────────────────
ALTER TABLE matches       ADD COLUMN IF NOT EXISTS shuttles_used INTEGER;
ALTER TABLE matches       ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_queue_entries_group ON queue_entries(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_group       ON matches(group_id);

-- ── 2. Loosen the hard member FKs → plain UUIDs ───────────────────────────────
-- Player ids may now reference members(id) (clubs) OR group_members(id) (groups).
-- Drop ANY foreign key on these columns by introspecting the catalog, so this
-- works regardless of how the constraints were named when the tables were made.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_namespace  nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) AS colnum ON true
    JOIN pg_attribute  att ON att.attrelid = rel.oid AND att.attnum = colnum
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND (
        (rel.relname = 'queue_entries' AND att.attname = 'member_id') OR
        (rel.relname = 'matches'       AND att.attname IN ('team_a_1','team_a_2','team_b_1','team_b_2'))
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.relname, r.conname);
  END LOOP;
END $$;

-- ── 3. RLS for group rows on the play tables ──────────────────────────────────
-- Reuses the SECURITY DEFINER helpers from migration 004 (is_group_owner /
-- is_group_member) so these policies never recurse.
--
-- Owner  → full control of their group's queue/matches (runs the night).
-- Member → read only (other phones watch live). Self-mutation can come later.

-- Queue ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner manages group queue" ON queue_entries;
DROP POLICY IF EXISTS "Members read group queue"  ON queue_entries;

CREATE POLICY "Owner manages group queue"
  ON queue_entries FOR ALL
  USING (group_id IS NOT NULL AND public.is_group_owner(group_id))
  WITH CHECK (group_id IS NOT NULL AND public.is_group_owner(group_id));

CREATE POLICY "Members read group queue"
  ON queue_entries FOR SELECT
  USING (group_id IS NOT NULL AND public.is_group_member(group_id));

-- Matches --------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner manages group matches" ON matches;
DROP POLICY IF EXISTS "Members read group matches"  ON matches;

CREATE POLICY "Owner manages group matches"
  ON matches FOR ALL
  USING (group_id IS NOT NULL AND public.is_group_owner(group_id))
  WITH CHECK (group_id IS NOT NULL AND public.is_group_owner(group_id));

CREATE POLICY "Members read group matches"
  ON matches FOR SELECT
  USING (group_id IS NOT NULL AND public.is_group_member(group_id));
