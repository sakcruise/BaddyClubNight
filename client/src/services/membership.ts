/**
 * Membership plans + member notes — Supabase only (back-office admin work,
 * no offline fallback, same stance as payments.ts).
 */
import { supabase } from "../lib/supabase";
import { getClubId, check } from "./api";
import type { MembershipPlan, MemberNote, BillingPeriod } from "../types";

const rowToPlan = (r: any): MembershipPlan => ({ ...r, fee: Number(r.fee) });

export const DEFAULT_PLANS: Array<Pick<MembershipPlan, "name" | "fee">> = [
  { name: "Full",    fee: 30 },
  { name: "Student", fee: 15 },
  { name: "Social",  fee: 10 },
];

export const plansApi = {
  list: async (): Promise<MembershipPlan[]> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("club_id", clubId)
      .order("sort_order")
      .order("created_at");
    return check(data, error).map(rowToPlan);
  },

  create: async (p: { name: string; fee: number; cadence: BillingPeriod; sort_order?: number }): Promise<MembershipPlan> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("membership_plans")
      .insert({ club_id: clubId, ...p })
      .select()
      .single();
    return rowToPlan(check(data, error));
  },

  /** Seeds Full / Student / Social for a club that has no plans yet. Safe to call twice (StrictMode). */
  seedDefaults: async (cadence: BillingPeriod): Promise<MembershipPlan[]> => {
    const clubId = await getClubId();
    const rows = DEFAULT_PLANS.map((p, i) => ({ club_id: clubId, ...p, cadence, sort_order: i }));
    const { error } = await supabase
      .from("membership_plans")
      .upsert(rows, { onConflict: "club_id,name", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return plansApi.list();
  },

  update: async (id: string, patch: Partial<Pick<MembershipPlan, "name" | "fee" | "cadence" | "active" | "sort_order">>): Promise<MembershipPlan> => {
    const { data, error } = await supabase
      .from("membership_plans")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    return rowToPlan(check(data, error));
  },

  /** Deleting a plan un-assigns it from members and old dues (FK ON DELETE SET NULL). */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from("membership_plans").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

export interface AttendanceRow {
  session_id: string;
  checked_in_at: string;
  date: string;
  club_name: string;
}

export const attendanceApi = {
  /** Nights a member checked in to, newest first (queue_entries is the check-in record). */
  forMember: async (member_id: string): Promise<AttendanceRow[]> => {
    const { data, error } = await supabase
      .from("queue_entries")
      .select("session_id, checked_in_at, sessions(date, club_name)")
      .eq("member_id", member_id)
      .order("checked_in_at", { ascending: false });
    return check(data, error).map((r: any) => ({
      session_id: r.session_id,
      checked_in_at: r.checked_in_at,
      date: r.sessions?.date ?? r.checked_in_at.slice(0, 10),
      club_name: r.sessions?.club_name ?? "",
    }));
  },
};

export const notesApi = {
  list: async (member_id: string): Promise<MemberNote[]> => {
    const { data, error } = await supabase
      .from("member_notes")
      .select("*")
      .eq("member_id", member_id)
      .order("created_at", { ascending: false });
    return check(data, error) as MemberNote[];
  },

  add: async (member_id: string, body: string, author: string | null): Promise<MemberNote> => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("member_notes")
      .insert({ club_id: clubId, member_id, body: body.trim(), author })
      .select()
      .single();
    return check(data, error) as MemberNote;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from("member_notes").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
