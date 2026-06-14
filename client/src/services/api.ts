/**
 * API layer — uses Supabase JS directly.
 * Works on Vercel (web) and Pi (when online).
 * The Pi Express server is only used for offline sync.
 *
 * OFFLINE MODE: when navigator.onLine === false OR localStorage "offline-mode" === "true",
 * all read/write operations are routed to the local Zustand stores instead of hitting
 * Supabase. This allows the full club night flow to work without internet.
 */
import { supabase } from "../lib/supabase";
import type { Member, Session, Match, QueuePosition, MemberType } from "../types";
import { v4 as uuid } from "uuid";
import { useMemberStore, useSessionStore, useQueueStore, useMatchStore, useSessionArchiveStore } from "../store";

// ─── Offline detection ────────────────────────────────────────────────────────
// True when the user explicitly chose offline mode OR the browser reports no network.
// Friends-group sessions also route here: they run entirely on the local engine
// (no Supabase tables yet), so any active session carrying a group_id is "local".
function isOffline(): boolean {
  if (localStorage.getItem("offline-mode") === "true" || !navigator.onLine) return true;
  if (useSessionStore.getState().session?.group_id) return true;
  return false;
}

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

// ─── Clubs (username ↔ email lookup) ─────────────────────────────────────────
// The clubs table is publicly readable so login can resolve username → email
// without the user being authenticated yet.

export const clubsApi = {
  /** Resolve a username to the Supabase auth email (always username@baddyapp.internal).
   *  Returns null if the username doesn't exist. */
  findEmail: async (username: string): Promise<string | null> => {
    const { data } = await supabase
      .from("accounts")
      .select("username")
      .eq("username", username.toLowerCase().trim())
      .maybeSingle();
    if (!data) return null;
    return `${data.username}@baddyapp.internal`;
  },

  /** Create an accounts row after successful signup.
   *  email is always the user's real email for password recovery.
   *  Supabase auth uses username@baddyapp.internal for all account types. */
  create: async (userId: string, username: string, displayName: string, email: string, accountType: "club" | "group" = "club") => {
    const { error } = await supabase.from("accounts").insert({
      username: username.toLowerCase().trim(),
      display_name: displayName.trim(),
      email: email.trim(),
      user_id: userId,
      account_type: accountType,
    });
    if (error) throw new Error(error.message);
  },

  /** Fetch club profile for the currently logged-in user. */
  getOwn: async (): Promise<{ username: string; display_name: string; email: string } | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("accounts")
      .select("username, display_name, email")
      .eq("user_id", user.id)
      .maybeSingle();
    return data ?? null;
  },

  /** Check if a username is already taken (anon-safe). */
  isUsernameTaken: async (username: string): Promise<boolean> => {
    const { data } = await supabase
      .from("accounts")
      .select("username")
      .eq("username", username.toLowerCase().trim())
      .maybeSingle();
    return !!data;
  },
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Login with username (or email as fallback for existing accounts).
   * Resolves username → email via clubs table, then signs in with email+password.
   */
  login: async (usernameOrEmail: string, password: string) => {
    // Try clubs table lookup first; fall back to treating input as email
    const resolvedEmail = await clubsApi.findEmail(usernameOrEmail) ?? usernameOrEmail.trim();
    const { data, error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
    if (error) throw new Error(error.message);
    const user = data.user!;
    const meta = user.user_metadata ?? {};
    return {
      token: data.session!.access_token,
      username: meta.username ?? usernameOrEmail,
      display_name: meta.display_name ?? meta.club_name ?? "",
      admin_name: meta.admin_name ?? "",
      email: resolvedEmail,
    };
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("offline-mode");
    localStorage.removeItem("offline-cached-at");
    // Reset app mode so the next user starts fresh (avoids stale "friends" mode
    // when a club account logs in after a group/guest session)
    try {
      const { useGroupStore } = await import("../store");
      useGroupStore.getState().setAppMode(null);
    } catch { /* best effort */ }
  },

  /**
   * Password reset for personal/group accounts (which use a synthetic Supabase
   * auth email). Verifies username + recovery email match, then returns a
   * single-use reset link generated server-side via the Supabase admin API.
   */
  forgotPersonal: async (username: string, email: string): Promise<string> => {
    const res = await fetch("/api/auth/forgot-personal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), email: email.trim() }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message ?? "Could not generate reset link");
    return json.reset_link as string;
  },
};

// ─── Members ──────────────────────────────────────────────────────────────────

export const membersApi = {
  list: async () => {
    if (isOffline()) {
      const members = Object.values(useMemberStore.getState().members).filter(
        (m) => m.member_type !== "guest"
      );
      return { members };
    }
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
    if (isOffline()) {
      const member: Member = {
        id: uuid(),
        name,
        member_type,
        email: email ?? "",
        created_at: new Date().toISOString(),
      };
      useMemberStore.getState().addMember(member);
      return { member };
    }
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("members")
      .insert({ id: uuid(), club_id: clubId, name, member_type, email: email ?? null })
      .select()
      .single();
    return { member: rowToMember(check(data, error)) };
  },

  update: async (id: string, patch: { name?: string; member_type?: MemberType }) => {
    if (isOffline()) {
      useMemberStore.getState().updateMember(id, patch);
      const member = useMemberStore.getState().members[id];
      return { member };
    }
    const { data, error } = await supabase
      .from("members")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    return { member: rowToMember(check(data, error)) };
  },

  delete: async (id: string) => {
    if (isOffline()) {
      useMemberStore.getState().deleteMember(id);
      return { ok: true as const };
    }
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  current: async () => {
    if (isOffline()) {
      return { session: useSessionStore.getState().session };
    }
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
    if (isOffline()) {
      const session: Session = {
        id: uuid(),
        club_name: payload.club_name,
        num_courts: payload.num_courts,
        date: new Date().toISOString().split("T")[0],
        status: "active",
        created_at: new Date().toISOString(),
      };
      return { session };
    }
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
    if (isOffline()) {
      const current = useSessionStore.getState().session;
      const session: Session = current
        ? { ...current, status: "ended" }
        : { id: sessionId, club_name: "", num_courts: 0, date: "", status: "ended", created_at: "" };
      return { session };
    }
    const { data, error } = await supabase
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .select()
      .single();
    return { session: check(data, error) as Session };
  },

  list: async () => {
    if (isOffline()) {
      // Merge local archive + current active session, newest first
      const archived = useSessionArchiveStore.getState().archivedSessions.map((a) => a.session);
      const current  = useSessionStore.getState().session;
      const all = [...archived, ...(current ? [current] : [])];
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { sessions: all };
    }
    const clubId = await getClubId();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });
    return { sessions: check(data, error) as Session[] };
  },

  delete: async (id: string) => {
    if (isOffline()) {
      // Remove from local archive if present
      const store = useSessionArchiveStore.getState();
      store.archiveSession(
        { id, club_name: "", num_courts: 0, date: "", status: "ended", created_at: "" },
        []
      );
      // Actually just filter it out — can't do that with current interface, so no-op offline
      return { ok: true as const };
    }
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  },

  summary: async (sessionId: string) => {
    if (isOffline()) {
      // Check local archive first
      const archived = useSessionArchiveStore.getState().archivedSessions.find(
        (a) => a.session.id === sessionId
      );
      if (archived) {
        const currentQueue = useQueueStore.getState().queue;
        return {
          session: archived.session,
          matches: archived.matches,
          queue: currentQueue.map((q) => ({
            member_id: q.member_id,
            position: q.position,
            checked_in_at: q.checked_in_at,
            name: q.member?.name ?? "Unknown",
            member_type: q.member?.member_type ?? "male",
          })),
        };
      }
      // Fall back to current session
      const session = useSessionStore.getState().session;
      const matches = useMatchStore.getState().matches.filter((m) => m.session_id === sessionId);
      const queue   = useQueueStore.getState().queue;
      if (!session) throw new Error("Session not found offline");
      return {
        session,
        matches,
        queue: queue.map((q) => ({
          member_id: q.member_id,
          position: q.position,
          checked_in_at: q.checked_in_at,
          name: q.member?.name ?? "Unknown",
          member_type: q.member?.member_type ?? "male",
        })),
      };
    }
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
    if (isOffline()) {
      return { queue: useQueueStore.getState().queue };
    }
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
    if (isOffline()) {
      const store = useQueueStore.getState();
      // Already in queue? No-op.
      if (store.queue.some((q) => q.member_id === memberId)) return { queue: store.queue };
      const nextPos = (store.queue.slice(-1)[0]?.position ?? 0) + 1;
      const member = useMemberStore.getState().members[memberId];
      store.addToQueue({ member_id: memberId, position: nextPos, checked_in_at: new Date().toISOString(), member });
      return { queue: useQueueStore.getState().queue };
    }

    const clubId = await getClubId();
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

  // Like checkIn but always inserts fresh (no ignoreDuplicates) — used for re-queuing after match
  checkInForce: async (sessionId: string, memberId: string) => {
    if (isOffline()) {
      const store = useQueueStore.getState();
      const member = useMemberStore.getState().members[memberId];
      const nextPos = (store.queue.slice(-1)[0]?.position ?? 0) + 1;
      store.addToQueue({ member_id: memberId, position: nextPos, checked_in_at: new Date().toISOString(), member });
      return;
    }
    const clubId = await getClubId();
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
      .insert({ id: uuid(), club_id: clubId, session_id: sessionId, member_id: memberId, position });
    if (error) throw new Error(error.message);
  },

  remove: async (sessionId: string, memberId: string) => {
    if (isOffline()) {
      useQueueStore.getState().removeFromQueue(memberId);
      return { queue: useQueueStore.getState().queue };
    }
    const { error } = await supabase
      .from("queue_entries")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return queueApi.get(sessionId);
  },

  reorder: async (sessionId: string, orderedMemberIds: string[]) => {
    if (isOffline()) {
      const currentQueue = useQueueStore.getState().queue;
      const reordered = orderedMemberIds.map((id, idx) => {
        const entry = currentQueue.find((q) => q.member_id === id)!;
        return { ...entry, position: idx + 1 };
      });
      useQueueStore.getState().reorderQueue(reordered);
      return;
    }
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
    if (isOffline()) {
      // Current session's matches
      const live = useMatchStore.getState().matches.filter((m) => m.session_id === sessionId);
      if (live.length > 0) return { matches: live };
      // Archived (ended) sessions
      const archived = useSessionArchiveStore.getState().archivedSessions.find(
        (a) => a.session.id === sessionId
      );
      return { matches: archived?.matches ?? [] };
    }
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("session_id", sessionId)
      .order("started_at");
    return { matches: check(data, error).map(rowToMatch) };
  },

  start: async (sessionId: string, payload: { court_id: number; team_a: [string, string]; team_b: [string, string] }) => {
    if (isOffline()) {
      const match: Match = {
        id: uuid(),
        session_id: sessionId,
        court_id: payload.court_id,
        team_a: payload.team_a,
        team_b: payload.team_b,
        result: "pending",
        started_at: new Date().toISOString(),
      };
      // Do NOT call addMatch here — callers (PlayerPicker, CheckInPanel) do it after receiving the match.
      return { match };
    }
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
    if (isOffline()) {
      const patch = { result: "complete" as const, ended_at: new Date().toISOString() };
      useMatchStore.getState().updateMatch(matchId, patch);
      const match = useMatchStore.getState().matches.find((m) => m.id === matchId)!;
      return { match };
    }
    const { data, error } = await supabase
      .from("matches")
      .update({ result: "complete", ended_at: new Date().toISOString() })
      .eq("id", matchId)
      .select()
      .single();
    return { match: rowToMatch(check(data, error)) };
  },

  score: async (matchId: string, score_a: number, score_b: number, shuttles_used?: number) => {
    if (isOffline()) {
      const patch: Partial<Match> = { score_a, score_b, ...(shuttles_used !== undefined ? { shuttles_used } : {}) };
      useMatchStore.getState().updateMatch(matchId, patch);
      const match = useMatchStore.getState().matches.find((m) => m.id === matchId)!;
      return { match };
    }
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
    if (isOffline()) {
      useMatchStore.getState().updateMatch(matchId, { team_a, team_b });
      const match = useMatchStore.getState().matches.find((m) => m.id === matchId)!;
      return { match };
    }
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
