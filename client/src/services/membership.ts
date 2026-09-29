/**
 * Membership plans + member notes — Supabase only (back-office admin work,
 * no offline fallback, same stance as payments.ts).
 */
import { supabase } from "../lib/supabase";
import { getClubId, check, rowToMember } from "./api";
import type { MembershipPlan, MemberNote, BillingPeriod, Member } from "../types";

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

export interface GuestSummary {
  member: Member;
  visits: number;
  last_visit: string | null;   // ISO timestamp of the latest check-in
}

export const guestsApi = {
  /** Every guest who has ever checked in, with visit counts. */
  list: async (): Promise<GuestSummary[]> => {
    const clubId = await getClubId();
    const { data: guests, error } = await supabase
      .from("members")
      .select("*")
      .eq("club_id", clubId)
      .eq("member_type", "guest")
      .order("name");
    const rows = check(guests, error);
    if (rows.length === 0) return [];
    const ids = rows.map((g: any) => g.id);
    const { data: visits, error: vErr } = await supabase
      .from("queue_entries")
      .select("member_id, checked_in_at")
      .in("member_id", ids);
    const agg = new Map<string, { n: number; last: string | null }>();
    for (const v of check(visits, vErr) as any[]) {
      const a = agg.get(v.member_id) ?? { n: 0, last: null };
      a.n += 1;
      if (!a.last || v.checked_in_at > a.last) a.last = v.checked_in_at;
      agg.set(v.member_id, a);
    }
    return rows.map((g: any) => ({
      member: rowToMember(g),
      visits: agg.get(g.id)?.n ?? 0,
      last_visit: agg.get(g.id)?.last ?? null,
    }));
  },

  /** Turns a guest into a member. Their id — and so all match history — is unchanged. */
  convert: async (id: string, p: { member_type: "male" | "female"; plan_id: string | null; status: "active" | "trial"; joined_at: string }): Promise<Member> => {
    const { data, error } = await supabase
      .from("members")
      .update({ ...p, active: true, paused_from: null, paused_until: null, pause_reason: null })
      .eq("id", id)
      .select()
      .single();
    return rowToMember(check(data, error));
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
