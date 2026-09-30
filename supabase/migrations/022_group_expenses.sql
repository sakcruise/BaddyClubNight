-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 022: Splitwise-style costs for friends groups
--
--   group_expenses        — one cost (court hire, shuttles, other), who paid it,
--                           optionally tied to a session.
--   group_expense_shares  — what each player owes of that cost. Stored exactly
--                           (pennies already split) so later roster changes
--                           never rewrite history.
--   group_settlements     — "A paid B back £x".
--
-- Balances are derived client-side: paid − owed ± settlements.
--
-- All reads/writes go through SECURITY DEFINER RPCs that check the caller is
-- the group's owner or a joined member (same pattern as list_group_sessions),
-- so the tables themselves have RLS on with no direct policies.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  category    TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('court','shuttles','other')),
  description TEXT NOT NULL DEFAULT '',
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_by     UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_expense_shares (
  expense_id UUID NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount     NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS group_settlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  to_member   UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_member <> to_member)
);

CREATE INDEX IF NOT EXISTS idx_group_expenses_group    ON group_expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_group_expenses_session  ON group_expenses(session_id);
CREATE INDEX IF NOT EXISTS idx_group_settlements_group ON group_settlements(group_id);

ALTER TABLE group_expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_settlements    ENABLE ROW LEVEL SECURITY;

-- ── Caller must be the owner or a joined member ──────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_group_access(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT (is_group_owner(p_group_id) OR is_group_member(p_group_id)) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;
END;
$$;

-- ── Read: every expense (with shares) and settlement for a group ─────────────
CREATE OR REPLACE FUNCTION public.list_group_ledger(p_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_group_access(p_group_id);
  RETURN json_build_object(
    'expenses', COALESCE((
      SELECT json_agg(json_build_object(
        'id',          e.id,
        'session_id',  e.session_id,
        'category',    e.category,
        'description', e.description,
        'amount',      e.amount,
        'paid_by',     e.paid_by,
        'created_by',  e.created_by,
        'created_at',  e.created_at,
        'shares', COALESCE((
          SELECT json_agg(json_build_object('member_id', sh.member_id, 'amount', sh.amount))
          FROM group_expense_shares sh WHERE sh.expense_id = e.id
        ), '[]'::json)
      ) ORDER BY e.created_at DESC)
      FROM group_expenses e WHERE e.group_id = p_group_id
    ), '[]'::json),
    'settlements', COALESCE((
      SELECT json_agg(json_build_object(
        'id',          s.id,
        'from_member', s.from_member,
        'to_member',   s.to_member,
        'amount',      s.amount,
        'created_by',  s.created_by,
        'created_at',  s.created_at
      ) ORDER BY s.created_at DESC)
      FROM group_settlements s WHERE s.group_id = p_group_id
    ), '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_group_ledger(UUID) TO authenticated;

-- ── Add an expense with its shares, atomically ───────────────────────────────
-- p_shares: [{"member_id": "...", "amount": 3.34}, ...] — must sum to p_amount.
CREATE OR REPLACE FUNCTION public.add_group_expense(
  p_group_id    UUID,
  p_session_id  UUID,
  p_category    TEXT,
  p_description TEXT,
  p_amount      NUMERIC,
  p_paid_by     UUID,
  p_shares      JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    UUID;
  v_total NUMERIC;
BEGIN
  PERFORM assert_group_access(p_group_id);

  IF NOT EXISTS (SELECT 1 FROM group_members WHERE id = p_paid_by AND group_id = p_group_id) THEN
    RAISE EXCEPTION 'Payer is not in this group';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND group_id = p_group_id
  ) THEN
    RAISE EXCEPTION 'Session is not in this group';
  END IF;
  IF jsonb_array_length(COALESCE(p_shares, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Pick at least one person to split with';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_shares) x
    WHERE NOT EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.id = (x->>'member_id')::uuid AND gm.group_id = p_group_id
    )
  ) THEN
    RAISE EXCEPTION 'Someone in the split is not in this group';
  END IF;

  SELECT SUM((x->>'amount')::numeric) INTO v_total FROM jsonb_array_elements(p_shares) x;
  IF v_total <> p_amount THEN
    RAISE EXCEPTION 'Shares (%) do not add up to the amount (%)', v_total, p_amount;
  END IF;

  INSERT INTO group_expenses (group_id, session_id, category, description, amount, paid_by, created_by)
  VALUES (p_group_id, p_session_id, p_category, COALESCE(p_description, ''), p_amount, p_paid_by, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO group_expense_shares (expense_id, member_id, amount)
  SELECT v_id, (x->>'member_id')::uuid, (x->>'amount')::numeric
  FROM jsonb_array_elements(p_shares) x;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_group_expense(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, JSONB) TO authenticated;

-- ── Delete an expense: the organiser, or whoever added it ────────────────────
CREATE OR REPLACE FUNCTION public.delete_group_expense(p_expense_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group UUID;
  v_by    UUID;
BEGIN
  SELECT group_id, created_by INTO v_group, v_by FROM group_expenses WHERE id = p_expense_id;
  IF v_group IS NULL THEN RETURN; END IF;
  IF NOT (is_group_owner(v_group) OR v_by = auth.uid()) THEN
    RAISE EXCEPTION 'Only the organiser or the person who added it can delete this';
  END IF;
  DELETE FROM group_expenses WHERE id = p_expense_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_group_expense(UUID) TO authenticated;

-- ── Record a settle-up payment ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_group_settlement(
  p_group_id UUID,
  p_from     UUID,
  p_to       UUID,
  p_amount   NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM assert_group_access(p_group_id);
  IF (SELECT COUNT(*) FROM group_members WHERE group_id = p_group_id AND id IN (p_from, p_to)) <> 2 THEN
    RAISE EXCEPTION 'Both people must be in this group';
  END IF;
  INSERT INTO group_settlements (group_id, from_member, to_member, amount, created_by)
  VALUES (p_group_id, p_from, p_to, p_amount, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_group_settlement(UUID, UUID, UUID, NUMERIC) TO authenticated;

-- ── Undo a settle-up: the organiser, or whoever recorded it ──────────────────
CREATE OR REPLACE FUNCTION public.delete_group_settlement(p_settlement_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group UUID;
  v_by    UUID;
BEGIN
  SELECT group_id, created_by INTO v_group, v_by FROM group_settlements WHERE id = p_settlement_id;
  IF v_group IS NULL THEN RETURN; END IF;
  IF NOT (is_group_owner(v_group) OR v_by = auth.uid()) THEN
    RAISE EXCEPTION 'Only the organiser or the person who recorded it can undo this';
  END IF;
  DELETE FROM group_settlements WHERE id = p_settlement_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_group_settlement(UUID) TO authenticated;

-- ── Who was at a session: anyone checked in or who played a game ─────────────
-- Queue rows are removed when a player goes on court, so matches fill the gap.
CREATE OR REPLACE FUNCTION public.group_session_attendees(p_session_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group UUID;
BEGIN
  SELECT group_id INTO v_group FROM sessions WHERE id = p_session_id;
  IF v_group IS NULL THEN RETURN; END IF;
  PERFORM assert_group_access(v_group);
  RETURN QUERY
    SELECT DISTINCT pid FROM (
      SELECT member_id AS pid FROM queue_entries WHERE session_id = p_session_id
      UNION SELECT team_a_1 FROM matches WHERE session_id = p_session_id
      UNION SELECT team_a_2 FROM matches WHERE session_id = p_session_id
      UNION SELECT team_b_1 FROM matches WHERE session_id = p_session_id
      UNION SELECT team_b_2 FROM matches WHERE session_id = p_session_id
    ) t
    WHERE pid IN (SELECT id FROM group_members WHERE group_id = v_group);
END;
$$;
GRANT EXECUTE ON FUNCTION public.group_session_attendees(UUID) TO authenticated;

-- ── Signed-in callers only (Postgres grants EXECUTE to PUBLIC by default) ─────
-- assert_group_access is an internal helper, called only from the RPCs above.
REVOKE EXECUTE ON FUNCTION public.assert_group_access(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_group_ledger(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_expense(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_group_expense(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_settlement(UUID, UUID, UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_group_settlement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.group_session_attendees(UUID) FROM PUBLIC, anon;
