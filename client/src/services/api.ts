import { supabase } from "../lib/supabase";
import type { Member, Session, Match, QueuePosition, MemberType } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClubId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function rowToMatch(row: any): Match {
  return {
    id: row.id,
    session_id: row.session_id,
    court_id: row.court_id,
    team_a: [row.team_a_1, row.team_a_2],
    team_b: [row.team_b_1, row.team_b_2],
    score_a: row.score_a ?? undefined,
    score_b: row.score_b ?? undefined,
    result: row.result,
    started_at: row.started_at,
    ended_at: row.ended_at ?? undefined,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: async (payload: { club_name: string; admin_name: string; email: string; password: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: { club_name: payload.club_name, admin_name: payload.admin_name },
      },
    });
    if (error) throw new Error(error.message);
    return { session: data.session, user: data.user };
  },

  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { session: data.session, user: data.user };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  getClubProfile: async () => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string; club_name: string; admin_name: string };
  },
};

// ─── Members ──────────────────────────────────────────────────────────────────

export const membersApi = {
  list: async () => {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return { members: (data ?? []) as Member[] };
  },

  create: async (name: string, member_type: MemberType = "male", email?: string) => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("members")
      .insert({ club_id: clubId, name: name.trim(), member_type, email: email ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { member: data as Member };
  },

  update: async (id: string, patch: { name?: string; member_type?: MemberType }) => {
    const { data, error } = await supabase
      .from("members")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { member: data as Member };
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  current: async () => {
    const clubId = await getClubId();
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("club_id", clubId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { session: (data as Session | null) };
  },

  start: async (payload: { club_name: string; num_courts: number }) => {
    const clubId = await getClubId();
    // End any existing active session
    await supabase
      .from("sessions")
      .update({ status: "ended" })
      .eq("club_id", clubId)
      .eq("status", "active");

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        club_id: clubId,
        club_name: payload.club_name,
        date: new Date().toISOString().split("T")[0],
        num_courts: payload.num_courts,
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { session: data as Session };
  },

  end: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { session: data as Session };
  },

  list: async () => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("club_id", clubId)
      .eq("status", "ended")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sessions: (data ?? []) as Session[] };
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  summary: async (id: string) => {
    const [sessionRes, matchesRes, queueRes] = await Promise.all([
      supabase.from("sessions").select("*").eq("id", id).single(),
      supabase.from("matches").select("*").eq("session_id", id).order("started_at"),
      supabase.from("queue_entries")
        .select("*, members(name, member_type)")
        .eq("session_id", id)
        .order("position"),
    ]);

    if (sessionRes.error) throw new Error(sessionRes.error.message);

    const queue = (queueRes.data ?? []).map((q: any) => ({
      member_id: q.member_id,
      position: q.position,
      checked_in_at: q.checked_in_at,
      name: q.members?.name ?? "Unknown",
      member_type: q.members?.member_type ?? "guest",
    }));

    return {
      session: sessionRes.data as Session,
      matches: (matchesRes.data ?? []).map(rowToMatch),
      queue,
    };
  },
};

// ─── Queue ────────────────────────────────────────────────────────────────────

export const queueApi = {
  get: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");
    if (error) throw new Error(error.message);
    return { queue: (data ?? []) as QueuePosition[] };
  },

  checkIn: async (sessionId: string, memberId: string) => {
    // Get current max position
    const { data: existing } = await supabase
      .from("queue_entries")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = (existing?.position ?? 0) + 1;

    // Upsert so re-check-in after match goes to back
    await supabase.from("queue_entries").upsert({
      session_id: sessionId,
      member_id: memberId,
      position,
      checked_in_at: new Date().toISOString(),
    }, { onConflict: "session_id,member_id", ignoreDuplicates: true });

    const { data } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");

    return { queue: (data ?? []) as QueuePosition[] };
  },

  remove: async (sessionId: string, memberId: string) => {
    await supabase
      .from("queue_entries")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", memberId);

    // Re-number remaining
    const { data: remaining } = await supabase
      .from("queue_entries")
      .select("id")
      .eq("session_id", sessionId)
      .order("position");

    if (remaining && remaining.length > 0) {
      await Promise.all(
        remaining.map((r: any, i: number) =>
          supabase.from("queue_entries").update({ position: i + 1 }).eq("id", r.id)
        )
      );
    }

    const { data } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("session_id", sessionId)
      .order("position");

    return { queue: (data ?? []) as QueuePosition[] };
  },
};

// ─── Matches ──────────────────────────────────────────────────────────────────

export const matchesApi = {
  list: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("session_id", sessionId)
      .order("started_at");
    if (error) throw new Error(error.message);
    return { matches: (data ?? []).map(rowToMatch) };
  },

  start: async (sessionId: string, payload: { court_id: number; team_a: [string, string]; team_b: [string, string] }) => {
    const { data, error } = await supabase
      .from("matches")
      .insert({
        session_id: sessionId,
        court_id: payload.court_id,
        team_a_1: payload.team_a[0],
        team_a_2: payload.team_a[1],
        team_b_1: payload.team_b[0],
        team_b_2: payload.team_b[1],
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { match: rowToMatch(data) };
  },

  complete: async (matchId: string) => {
    const { data, error } = await supabase
      .from("matches")
      .update({ result: "complete", ended_at: new Date().toISOString() })
      .eq("id", matchId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { match: rowToMatch(data) };
  },

  score: async (matchId: string, score_a: number, score_b: number) => {
    const { data, error } = await supabase
      .from("matches")
      .update({ score_a, score_b, result: "complete", ended_at: new Date().toISOString() })
      .eq("id", matchId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { match: rowToMatch(data) };
  },
};
