import type { Member, Session, Match, QueuePosition, MemberType } from "../types";

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("auth-store");
    return raw ? (JSON.parse(raw)?.state?.token ?? null) : null;
  } catch { return null; }
}

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = getToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as any).message ?? "Request failed");
  }

  return res.json() as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: async (payload: { club_name: string; admin_name: string; email: string; password: string }) => {
    return http<{ token: string; club_name: string; admin_name: string; email: string }>(
      "POST", "/auth/register", payload
    );
  },

  login: async (email: string, password: string) => {
    return http<{ token: string; club_name: string; admin_name: string; email: string }>(
      "POST", "/auth/login", { email, password }
    );
  },

  me: async () => {
    return http<{ club: { id: string; club_name: string; admin_name: string; email: string } }>(
      "GET", "/auth/me"
    );
  },

  logout: () => {
    // Token is cleared by clearProfile() in the store
  },
};

// ─── Members ──────────────────────────────────────────────────────────────────

export const membersApi = {
  list: async () => http<{ members: Member[] }>("GET", "/members"),

  create: async (name: string, member_type: MemberType = "male", email?: string) =>
    http<{ member: Member }>("POST", "/members", { name, member_type, email }),

  update: async (id: string, patch: { name?: string; member_type?: MemberType }) =>
    http<{ member: Member }>("PATCH", `/members/${id}`, patch),

  delete: async (id: string) => http<{ ok: true }>("DELETE", `/members/${id}`),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  current: async () => http<{ session: Session | null }>("GET", "/sessions/current"),

  start: async (payload: { club_name: string; num_courts: number }) =>
    http<{ session: Session }>("POST", "/sessions", payload),

  end: async (sessionId: string) =>
    http<{ session: Session }>("POST", `/sessions/${sessionId}/end`),

  list: async () => http<{ sessions: Session[] }>("GET", "/sessions"),

  delete: async (id: string) => http<{ ok: true }>("DELETE", `/sessions/${id}`),

  summary: async (id: string) =>
    http<{ session: Session; matches: Match[]; queue: any[] }>("GET", `/sessions/${id}/summary`),
};

// ─── Queue ────────────────────────────────────────────────────────────────────

export const queueApi = {
  get: async (sessionId: string) =>
    http<{ queue: QueuePosition[] }>("GET", `/sessions/${sessionId}/queue`),

  checkIn: async (sessionId: string, memberId: string) =>
    http<{ queue: QueuePosition[] }>("POST", `/sessions/${sessionId}/queue/checkin`, { member_id: memberId }),

  remove: async (sessionId: string, memberId: string) =>
    http<{ queue: QueuePosition[] }>("DELETE", `/sessions/${sessionId}/queue/${memberId}`),

  reorder: async (sessionId: string, orderedMemberIds: string[]) =>
    http<void>("PATCH", `/sessions/${sessionId}/queue/reorder`, { member_ids: orderedMemberIds }),
};

// ─── Matches ──────────────────────────────────────────────────────────────────

export const matchesApi = {
  list: async (sessionId: string) =>
    http<{ matches: Match[] }>("GET", `/sessions/${sessionId}/matches`),

  start: async (sessionId: string, payload: { court_id: number; team_a: [string, string]; team_b: [string, string] }) =>
    http<{ match: Match }>("POST", `/sessions/${sessionId}/matches`, payload),

  complete: async (matchId: string) =>
    http<{ match: Match }>("POST", `/matches/${matchId}/complete`),

  score: async (matchId: string, score_a: number, score_b: number) =>
    http<{ match: Match }>("PATCH", `/matches/${matchId}/score`, { score_a, score_b }),

  updateTeams: async (matchId: string, team_a: [string, string], team_b: [string, string]) =>
    http<{ match: Match }>("PATCH", `/matches/${matchId}/teams`, { team_a, team_b }),
};

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const syncApi = {
  push: async (sessionId: string) =>
    http<{ synced_at: string }>("POST", `/sync/${sessionId}`),

  pullMembers: async () =>
    http<{ imported: number }>("POST", "/sync/pull/members"),
};
