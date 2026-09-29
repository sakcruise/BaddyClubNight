-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018: Payments — membership dues + per-session fees
--
-- Manual tracking only: an admin marks each row paid / unpaid / waived. The
-- money itself moves outside the app (cash, bank transfer, UPI...).
--
-- Scoped by club_id = auth.uid(), the same shape as every other club table.
-- Migration 019 tightens these policies to owner/treasurer via is_club_admin().
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS membership_dues (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  amount_due   NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','waived')),
  paid_method  TEXT CHECK (paid_method IN ('cash','bank_transfer','upi','other')),
  paid_at      TIMESTAMPTZ,
  marked_by    UUID REFERENCES auth.users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, period_label)
);

CREATE TABLE IF NOT EXISTS session_fees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount_due   NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','waived')),
  paid_method  TEXT CHECK (paid_method IN ('cash','bank_transfer','upi','other')),
  paid_at      TIMESTAMPTZ,
  marked_by    UUID REFERENCES auth.users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_dues_club    ON membership_dues(club_id);
CREATE INDEX IF NOT EXISTS idx_membership_dues_member  ON membership_dues(member_id);
CREATE INDEX IF NOT EXISTS idx_session_fees_club       ON session_fees(club_id);
CREATE INDEX IF NOT EXISTS idx_session_fees_session    ON session_fees(session_id);
CREATE INDEX IF NOT EXISTS idx_session_fees_member     ON session_fees(member_id);

ALTER TABLE membership_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_fees    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club read own dues"   ON membership_dues;
DROP POLICY IF EXISTS "Club insert own dues" ON membership_dues;
DROP POLICY IF EXISTS "Club update own dues" ON membership_dues;
DROP POLICY IF EXISTS "Club delete own dues" ON membership_dues;

CREATE POLICY "Club read own dues"   ON membership_dues FOR SELECT USING (club_id = auth.uid());
CREATE POLICY "Club insert own dues" ON membership_dues FOR INSERT WITH CHECK (club_id = auth.uid());
CREATE POLICY "Club update own dues" ON membership_dues FOR UPDATE USING (club_id = auth.uid());
CREATE POLICY "Club delete own dues" ON membership_dues FOR DELETE USING (club_id = auth.uid());

DROP POLICY IF EXISTS "Club read own session fees"   ON session_fees;
DROP POLICY IF EXISTS "Club insert own session fees" ON session_fees;
DROP POLICY IF EXISTS "Club update own session fees" ON session_fees;
DROP POLICY IF EXISTS "Club delete own session fees" ON session_fees;

CREATE POLICY "Club read own session fees"   ON session_fees FOR SELECT USING (club_id = auth.uid());
CREATE POLICY "Club insert own session fees" ON session_fees FOR INSERT WITH CHECK (club_id = auth.uid());
CREATE POLICY "Club update own session fees" ON session_fees FOR UPDATE USING (club_id = auth.uid());
CREATE POLICY "Club delete own session fees" ON session_fees FOR DELETE USING (club_id = auth.uid());
