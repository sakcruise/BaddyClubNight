/**
 * Read-only Supabase queries for the public Vercel web view.
 * Used only when isWeb() === true (i.e. not on localhost/Pi).
 */
import { supabase } from "../lib/supabase";
import type { Member, Session, Match } from "../types";

export const publicApi = {
  /** All synced sessions (most recent first) */
  sessions: async (): Promise<Session[]> => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({
      id: s.id,
      club_name: s.club_name,
      date: s.date,
      num_courts: s.num_courts,
      status: s.status,
      created_at: s.created_at,
    }));
  },

  /** All members */
  members: async (): Promise<Member[]> => {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .neq("member_type", "guest")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
      email: m.email ?? "",
      avatar_url: m.avatar_url ?? undefined,
      member_type: m.member_type ?? "male",
      created_at: m.created_at,
    }));
  },

  /** Matches for a session */
  matches: async (sessionId: string): Promise<Match[]> => {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("session_id", sessionId)
      .order("started_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: any) => ({
      id: m.id,
      session_id: m.session_id,
      court_id: m.court_id,
      team_a: [m.team_a_1, m.team_a_2],
      team_b: [m.team_b_1, m.team_b_2],
      score_a: m.score_a ?? undefined,
      score_b: m.score_b ?? undefined,
      result: m.result,
      started_at: m.started_at,
      ended_at: m.ended_at ?? undefined,
    }));
  },

  /** Queue / check-ins for a session */
  queue: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("queue_entries")
      .select("*, members(id, name, member_type)")
      .eq("session_id", sessionId)
      .order("position");
    if (error) throw new Error(error.message);
    return (data ?? []).map((q: any) => ({
      member_id: q.member_id,
      position: q.position,
      checked_in_at: q.checked_in_at,
      name: q.members?.name ?? "Unknown",
      member_type: q.members?.member_type ?? "male",
    }));
  },
};
