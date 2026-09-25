-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 019: Membership — plans (tiers), member lifecycle, pause, notes
--
--   • membership_plans: Full / Student / Social… each with a fee and cadence
--   • members: status lifecycle, contact details, plan, pause window
--   • member_notes: committee comments on a member (injury, agreements…)
--   • membership_dues.plan_id: which plan a due was billed under
--
-- Scoped by club_id = auth.uid(), the same shape as every other club table.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS membership_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  fee         NUMERIC(10,2) NOT NULL DEFAULT 0,
  cadence     TEXT NOT NULL DEFAULT 'quarterly'
              CHECK (cadence IN ('monthly','quarterly','half_yearly','yearly')),
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, name)
);
CREATE INDEX IF NOT EXISTS idx_membership_plans_club ON membership_plans(club_id);

ALTER TABLE members ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('guest','trial','active','paused','lapsed','archived'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone             TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS joined_at         DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS plan_id           UUID REFERENCES membership_plans(id) ON DELETE SET NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS paused_from       DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS paused_until      DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS pause_reason      TEXT;
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- Backfill status from what we already know (safe to re-run)
UPDATE members SET status = 'guest'    WHERE member_type = 'guest' AND status = 'active';
UPDATE members SET status = 'archived' WHERE active = false        AND status = 'active';
UPDATE members SET joined_at = created_at::date WHERE joined_at IS NULL AND member_type <> 'guest';

CREATE TABLE IF NOT EXISTS member_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author      TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_notes_member ON member_notes(member_id);

ALTER TABLE membership_dues ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES membership_plans(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_notes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club read own plans"   ON membership_plans;
DROP POLICY IF EXISTS "Club insert own plans" ON membership_plans;
DROP POLICY IF EXISTS "Club update own plans" ON membership_plans;
DROP POLICY IF EXISTS "Club delete own plans" ON membership_plans;
CREATE POLICY "Club read own plans"   ON membership_plans FOR SELECT USING (club_id = auth.uid());
CREATE POLICY "Club insert own plans" ON membership_plans FOR INSERT WITH CHECK (club_id = auth.uid());
CREATE POLICY "Club update own plans" ON membership_plans FOR UPDATE USING (club_id = auth.uid());
CREATE POLICY "Club delete own plans" ON membership_plans FOR DELETE USING (club_id = auth.uid());

DROP POLICY IF EXISTS "Club read own member notes"   ON member_notes;
DROP POLICY IF EXISTS "Club insert own member notes" ON member_notes;
DROP POLICY IF EXISTS "Club update own member notes" ON member_notes;
DROP POLICY IF EXISTS "Club delete own member notes" ON member_notes;
CREATE POLICY "Club read own member notes"   ON member_notes FOR SELECT USING (club_id = auth.uid());
CREATE POLICY "Club insert own member notes" ON member_notes FOR INSERT WITH CHECK (club_id = auth.uid());
CREATE POLICY "Club update own member notes" ON member_notes FOR UPDATE USING (club_id = auth.uid());
CREATE POLICY "Club delete own member notes" ON member_notes FOR DELETE USING (club_id = auth.uid());
