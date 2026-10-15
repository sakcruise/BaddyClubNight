-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024: Edit a saved group cost
--
-- Replaces a cost's details and its shares in one step, with the same checks
-- as add_group_expense (022). Allowed for the group's organiser or whoever
-- added the cost — the same people who can delete it.
--
-- HOW TO RUN:
--   Paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_group_expense(
  p_expense_id  UUID,
  p_session_id  UUID,
  p_category    TEXT,
  p_description TEXT,
  p_amount      NUMERIC,
  p_paid_by     UUID,
  p_shares      JSONB
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group UUID;
  v_by    UUID;
  v_total NUMERIC;
BEGIN
  SELECT group_id, created_by INTO v_group, v_by FROM group_expenses WHERE id = p_expense_id;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'That cost no longer exists';
  END IF;
  IF NOT (is_group_owner(v_group) OR v_by = auth.uid()) THEN
    RAISE EXCEPTION 'Only the organiser or the person who added it can edit this';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be more than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE id = p_paid_by AND group_id = v_group) THEN
    RAISE EXCEPTION 'Payer is not in this group';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND group_id = v_group
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
      WHERE gm.id = (x->>'member_id')::uuid AND gm.group_id = v_group
    )
  ) THEN
    RAISE EXCEPTION 'Someone in the split is not in this group';
  END IF;

  SELECT SUM((x->>'amount')::numeric) INTO v_total FROM jsonb_array_elements(p_shares) x;
  IF v_total <> p_amount THEN
    RAISE EXCEPTION 'Shares (%) do not add up to the amount (%)', v_total, p_amount;
  END IF;

  UPDATE group_expenses
     SET session_id = p_session_id, category = p_category, description = COALESCE(p_description, ''),
         amount = p_amount, paid_by = p_paid_by
   WHERE id = p_expense_id;

  DELETE FROM group_expense_shares WHERE expense_id = p_expense_id;
  INSERT INTO group_expense_shares (expense_id, member_id, amount)
  SELECT p_expense_id, (x->>'member_id')::uuid, (x->>'amount')::numeric
  FROM jsonb_array_elements(p_shares) x;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_group_expense(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_expense(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, JSONB) TO authenticated;
