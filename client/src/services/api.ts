/**
 * API layer — uses Supabase JS directly.
 * Works on Vercel (web) and Pi (when online).
 * The Pi Express server is only used for offline sync.
 */
import { supabase } from "../lib/supabase";
import type { Member, Session, Match, QueuePosition, MemberType } from "../types";
import { v4 as uuid } from "uuid";

// ─── Helper: get current club's user id ───────────────────────────────────────
async function getClubId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ─── Helper: throw on Supabase error ─────────────────────────────────────────
function check<T>(data: T | null, error: any): T {
  if (error) throw new Error(error.message ?? "Supabase error");
  if (data === null) throw new Error("No data returned");
  return data;
}

// ─── Helper: map match row → Match type ──────────────────────────────────────
function rowToMatch(m: any): Match {
  return {
    id: m.id,
    session_id: m.session_id,
    court_id: m.court_id,
    team_a: [m.team_a_1, m.team_a_2],
    team_b: [m.team_b_1, m.team_b_2],
    score_a: m.score_a ?? undefined,
    score_b: m.score_b ?? undefined,
    shuttles_used: m.shuttles_used ?? undefined,
    result: m.result,
    started_at: m.started_at,
    ended_at: m.ended_at ?? undefined,
  };
}

// ─── Helper: map member row → Member type ────────────────────────────────────
function rowToMember(m: any): Member {
  return {
    id: m.id,
    name: m.name,
    email: m.email ?? "",
    avatar_url: m.avatar_url ?? undefined,
    member_type: m.member_type ?? "male",
    created_at: m.created_at,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = data.user!;
    return {
      token: data.session!.access_token,
      club_name: user.user_metadata?.club_name ?? email,
      admin_name: user.user_metadata?.admin_name ?? "",
      email: user.email ?? "",
    };
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("offline-mode");
    localStorage.removeItem("offline-cached-at");
  },
};

// ─── Members ──────────────────────────────────────────────────────────────────

export const membersApi = {
  list: async () => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("club_id", clubId)
      .neq("member_type", "guest")
      .order("name");
    return { members: check(data, error).map(rowToMember) };
  },

  create: async (name: string, member_type: MemberType = "male", email?: string) => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("members")
      .insert({ id: uuid(), club_id: clubId, name, member_type, email: email ?? null })
      .select()
      .single();
    return { member: rowToMember(check(data, error)) };
  },

  update: async (id: string, patch: { name?: string; member_type?: MemberType }) => {
    const { data, error } = await supabase
      .from("members")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    return { member: rowToMember(check(data, error)) };
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  current: async () => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("club_id", clubId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { session: data as Session | null };
  },

  start: async (payload: { club_name: string; num_courts: number }) => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        id: uuid(),
        club_id: clubId,
        club_name: payload.club_name,
        num_courts: payload.num_courts,
        date: new Date().toISOString().split("T")[0],
        status: "active",
      })
      .select()
      .single();
    return { session: check(data, error) as Session };
  },

  end: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .select()
      .single();
    return { session: check(data, error) as Session };
  },

  list: async () => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });
    return { sessions: check(data, error) as Session[] };
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  },

  summary: async (sessionId: string) => {
    const [sessionRes, matchesRes, queueRes] = await Promise.all([
      supabase.from("sessions").select("*").eq("id", sessionId).single(),
      supabase.from("matches").select("*").eq("session_id", sessionId).order("started_at"),
      supabase.from("queue_entries").select("*, members(id,name,member_type)").eq("session_id", sessionId).order("position"),
    ]);
    if (sessionRes.error) throw new Error(sessionRes.error.message);
    return {
      session: sessionRes.data as Session,
      matches: (matchesRes.data ?? []).map(rowToMatch),
      queue: (queueRes.data ?? []).map((q: any) => ({
        member_id: q.member_id,
        position: q.position,
        checked_in_at: q.checked_in_at,
        name: q.members?.name ?? "Unknown",
        member_type: q.members?.member_type ?? "male",
      })),
    };
  },
};

// ─── Queue ────────────────────────────────────────────────────────────────────

export const queueApi = {
  get: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("queue_entries")
      .select("*, members(id, name, member_type, avatar_url, email, created_at)")
      .eq("session_id", sessionId)
      .order("position");
    const rows = check(data, error);
    const queue: QueuePosition[] = rows.map((r: any) => ({
      member_id: r.member_id,
      position: r.position,
      checked_in_at: r.checked_in_at,
      member: rowToMember(r.members),
    }));
    return { queue };
  },

  checkIn: async (sessionId: string, memberId: string) => {
    const clubId = await getClubId();

    // Get current max position
    const { data: existing } = await supabase
      .from("queue_entries")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = (existing?.position ?? 0) + 1;

    const { error } = await supabase
      .from("queue_entries")
      .upsert(
        { id: uuid(), club_id: clubId, session_id: sessionId, member_id: memberId, position },
        { onConflict: "session_id,member_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);

    return queueApi.get(sessionId);
  },

  remove: async (sessionId: string, memberId: string) => {
    const { error } = await supabase
      .from("queue_entries")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return queueApi.get(sessionId);
  },

  reorder: async (sessionId: string, orderedMemberIds: string[]) => {
    const updates = orderedMemberIds.map((memberId, idx) =>
      supabase
        .from("queue_entries")
        .update({ position: idx + 1 })
        .eq("session_id", sessionId)
        .eq("member_id", memberId)
    );
    await Promise.all(updates);
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
    return { matches: check(data, error).map(rowToMatch) };
  },

  start: async (sessionId: string, payload: { court_id: number; team_a: [string, string]; team_b: [string, string] }) => {
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("matches")
      .insert({
        id: uuid(),
        club_id: clubId,
        session_id: sessionId,
        court_id: payload.court_id,
        team_a_1: payload.team_a[0],
        team_a_2: payload.team_a[1],
        team_b_1: payload.team_b[0],
        team_b_2: payload.team_b[1],
        result: "pending",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    return { match: rowToMatch(check(data, error)) };
  },

  complete: async (matchId: string) => {
    const { data, error } = await supabase
      .from("matches")
      .update({ result: "complete", ended_at: new Date().toISOString() })
      .eq("id", matchId)
      .select()
      .single();
    return { match: rowToMatch(check(data, error)) };
  },

  score: async (matchId: string, score_a: number, score_b: number, shuttles_used?: number) => {
    const patch: Record<string, unknown> = { score_a, score_b };
    if (shuttles_used !== undefined) patch.shuttles_used = shuttles_used;
    const { data, error } = await supabase
      .from("matches")
      .update(patch)
      .eq("id", matchId)
      .select()
      .single();
    return { match: rowToMatch(check(data, error)) };
  },

  updateTeams: async (matchId: string, team_a: [string, string], team_b: [string, string]) => {
    const { data, error } = await supabase
      .from("matches")
      .update({ team_a_1: team_a[0], team_a_2: team_a[1], team_b_1: team_b[0], team_b_2: team_b[1] })
      .eq("id", matchId)
      .select()
      .single();
    return { match: rowToMatch(check(data, error)) };
  },
};

// ─── Sync (Pi only — pushes local SQLite data to Supabase after offline night) ─
export const syncApi = {
  push: async (sessionId: string) => {
    // On web this is a no-op — data is already in Supabase
    // On Pi this calls the local Express server
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      const tok = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/sync/${sessionId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json() as Promise<{ synced_at: string }>;
    }
    return { synced_at: new Date().toISOString() };
  },

  pullMembers: async () => {
    // On web — no-op, members already in Supabase
    return { imported: 0 };
  },
};
