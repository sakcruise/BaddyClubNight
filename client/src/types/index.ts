// ─── Core Domain Types ────────────────────────────────────────────────────────

export type MemberType = "male" | "female" | "guest";

export interface Member {
  id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  member_type: MemberType;
  created_at: string;
}

export type CourtStatus = "idle" | "playing" | "reserved";

export interface Court {
  id: number;           // 1–6
  status: CourtStatus;
  current_match_id?: string;
}

export type QueuePosition = {
  member_id: string;
  member: Member;
  position: number;       // 1-indexed
  checked_in_at: string;
};

export type MatchResult = "pending" | "complete";

export interface Match {
  id: string;
  session_id: string;
  court_id: number;
  team_a: [string, string];   // member IDs
  team_b: [string, string];
  score_a?: number;
  score_b?: number;
  result: MatchResult;
  started_at: string;
  ended_at?: string;
}

export interface Session {
  id: string;
  club_name: string;
  date: string;           // ISO date YYYY-MM-DD
  num_courts: number;
  status: "setup" | "active" | "ended";
  created_at: string;
}

export interface PlayerStats {
  member_id: string;
  member: Member;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  matches_played: number;
  win_rate: number;       // 0–1
}

// ─── Queue Logic Types ────────────────────────────────────────────────────────

export interface PickerState {
  isOpen: boolean;
  picker_id: string | null;       // player #1 in queue doing the picking
  candidates: QueuePosition[];    // top 8 available to pick from
  picked: string[];               // IDs chosen so far (need 3)
  target_court: number | null;
}

// ─── UI / Store ───────────────────────────────────────────────────────────────

export type AppMode = "kiosk" | "mobile" | "admin";

export type OnlineStatus = "online" | "offline";

export interface SyncState {
  last_synced_at?: string;
  pending_changes: number;
  status: "idle" | "syncing" | "error";
  error?: string;
}
