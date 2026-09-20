/**
 * Payments API — Supabase only. Payments is back-office admin work, so unlike
 * the play-loop APIs there is deliberately no offline/Zustand fallback here.
 */
import { supabase } from "../lib/supabase";
import { getClubId, check } from "./api";
import type { MembershipDue, SessionFee, PaymentStatus, PaidMethod } from "../types";

export interface PaymentSessionSummary {
  id: string;
  date: string;
  club_name: string;
  status: string;
}

// NUMERIC columns arrive as strings from PostgREST
const rowToDue = (r: any): MembershipDue => ({ ...r, amount_due: Number(r.amount_due) });
const rowToFee = (r: any): SessionFee => ({ ...r, amount_due: Number(r.amount_due) });

async function statusPatch(status: PaymentStatus, method?: PaidMethod, notes?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  return {
    status,
    paid_method: status === "paid" ? method ?? "other" : null,
    paid_at: status === "paid" ? new Date().toISOString() : null,
    marked_by: user?.id ?? null,
    ...(notes !== undefined ? { notes } : {}),
  };
}

export const paymentsApi = {
  // ── Membership dues ────────────────────────────────────────────────────────
  listDues: async (): Promise<MembershipDue[]> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("membership_dues")
      .select("*")
      .eq("club_id", clubId)
      .order("period_start", { ascending: false });
    return check(data, error).map(rowToDue);
  },

  /** Creates one unpaid due per member for a period; members already billed for it are skipped. */
  createPeriod: async (p: {
    period_label: string;
    period_start: string;
    period_end: string;
    amount_due: number;
    member_ids: string[];
  }): Promise<void> => {
    if (p.member_ids.length === 0) return;
    const clubId = await getClubId();
    const rows = p.member_ids.map((member_id) => ({
      club_id: clubId,
      member_id,
      period_label: p.period_label.trim(),
      period_start: p.period_start,
      period_end: p.period_end,
      amount_due: p.amount_due,
    }));
    const { error } = await supabase
      .from("membership_dues")
      .upsert(rows, { onConflict: "member_id,period_label", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  },

  setDueStatus: async (id: string, status: PaymentStatus, method?: PaidMethod, notes?: string): Promise<MembershipDue> => {
    const { data, error } = await supabase
      .from("membership_dues")
      .update(await statusPatch(status, method, notes))
      .eq("id", id)
      .select()
      .single();
    return rowToDue(check(data, error));
  },

  deleteDue: async (id: string): Promise<void> => {
    const { error } = await supabase.from("membership_dues").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Session fees ───────────────────────────────────────────────────────────
  listSessionFees: async (): Promise<SessionFee[]> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("session_fees")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });
    return check(data, error).map(rowToFee);
  },

  /** One unpaid fee per member for a session; members already charged for it are skipped. */
  generateSessionFees: async (session_id: string, member_ids: string[], amount_due: number): Promise<void> => {
    if (member_ids.length === 0) return;
    const clubId = await getClubId();
    const rows = member_ids.map((member_id) => ({ club_id: clubId, session_id, member_id, amount_due }));
    const { error } = await supabase
      .from("session_fees")
      .upsert(rows, { onConflict: "session_id,member_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  },

  setSessionFeeStatus: async (id: string, status: PaymentStatus, method?: PaidMethod, notes?: string): Promise<SessionFee> => {
    const { data, error } = await supabase
      .from("session_fees")
      .update(await statusPatch(status, method, notes))
      .eq("id", id)
      .select()
      .single();
    return rowToFee(check(data, error));
  },

  deleteSessionFee: async (id: string): Promise<void> => {
    const { error } = await supabase.from("session_fees").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Lookups used by the Session Fees tab ──────────────────────────────────
  listRecentSessions: async (limit = 40): Promise<PaymentSessionSummary[]> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .select("id, date, club_name, status")
      .eq("club_id", clubId)
      .neq("status", "upcoming")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    return check(data, error) as PaymentSessionSummary[];
  },

  /** Member ids who checked in to a session (queue_entries is the check-in record). */
  listCheckedIn: async (session_id: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from("queue_entries")
      .select("member_id")
      .eq("session_id", session_id);
    return [...new Set(check(data, error).map((r: any) => r.member_id as string))];
  },
};
