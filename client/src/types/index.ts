// ─── Core Domain Types ────────────────────────────────────────────────────────

export type MemberType = "male" | "female" | "guest";

export interface Member {
  id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  member_type: MemberType;
  level: number;          // 1..MAX_LEVEL, see LEVEL_LABELS
  active?: boolean;       // false = archived: hidden from rosters, kept for history
  created_at: string;
}

export type AutoPickMode = "balanced" | "competitive";

export const LEVEL_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Improver",
  3: "Intermediate",
  4: "Upper Intermediate",
  5: "Advanced",
  6: "Elite",
};
export const MAX_LEVEL = 6;
export const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

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
  shuttles_used?: number;
  result: MatchResult;
  started_at: string;
  ended_at?: string;
}

export interface Session {
  id: string;
  club_name: string;
  date: string;           // ISO date YYYY-MM-DD
  num_courts: number;
  status: "setup" | "active" | "ended" | "upcoming";
  group_id?: string;      // set when this session belongs to a friends-group (runs on local engine)
  tournament_id?: string; // set when this session is running a tournament
  scheduled_at?: string;  // ISO datetime for upcoming/scheduled sessions
  venue?: string;
  created_at: string;
}

// ─── Tournaments (level-balanced groups → round-robin → knockout) ─────────────

export type TournamentStatus = "groups" | "knockout" | "complete";
export type FixtureStage = "group" | "knockout";
export type FixtureStatus = "pending" | "active" | "complete";

export interface Tournament {
  id: string;
  session_id: string;
  name: string;
  num_groups: number;
  advance_per_group: number;
  status: TournamentStatus;
  created_at: string;
}

export interface TournamentPlayer {
  id: string;
  tournament_id: string;
  member_id: string;
  group_index: number;
  pair_index: number | null; // null = reserve (odd one out, not paired)
  seed: number;
}

export interface TournamentFixture {
  id: string;
  tournament_id: string;
  stage: FixtureStage;
  group_index: number | null;
  round: number;
  seed: number | null;
  team_a: [string, string] | null;
  team_b: [string, string] | null; // null = bye (team_a auto-advances)
  match_id: string | null;
  status: FixtureStatus;
  created_at: string;
}

export interface GroupRsvp {
  id: string;
  member_id: string;
  member_name: string;
  status: "yes" | "no" | "maybe";
}

export interface GroupSession {
  id: string;
  group_id: string;
  club_name: string;
  scheduled_at: string;
  venue?: string;
  num_courts: number;
  status: "upcoming" | "active" | "ended";
  created_at: string;
  rsvps: GroupRsvp[];
  going_count: number;
}

// ─── Friends Groups (Splitwise-style casual play) ──────────────────────────────
// A logged-in person can own multiple groups, each with its own members and
// sessions. Unlike a club, a group has no fixed night — sessions are ad-hoc.

export interface GroupMember {
  id: string;
  name: string;
  member_type: MemberType;   // male | female | guest
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  venue?: string;
  num_courts: number;        // default 1 — small groups usually share one court
  themeKey: string;
  invite_token: string;      // basis for the shareable join link
  owner_id?: string;         // Supabase auth user id of the organiser (undefined for local/guest groups)
  members: GroupMember[];
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

export interface PitstopState {
  players: string[]; // 4 player IDs [picker, p2, p3, p4]
  pairs: Record<string, "A" | "B">;
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

// ─── Payments (manual tracking — money moves outside the app) ─────────────────

export type BillingPeriod = "monthly" | "quarterly" | "half_yearly" | "yearly";
export type PaymentStatus = "unpaid" | "paid" | "waived";
export type PaidMethod = "cash" | "bank_transfer" | "upi" | "other";

export interface MembershipDue {
  id: string;
  club_id: string;
  member_id: string;
  period_label: string;   // admin-defined, e.g. "2026 Q1" or "Sep 2026"
  period_start: string;   // ISO date
  period_end: string;     // ISO date
  amount_due: number;
  status: PaymentStatus;
  paid_method: PaidMethod | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface SessionFee {
  id: string;
  club_id: string;
  session_id: string;
  member_id: string;
  amount_due: number;
  status: PaymentStatus;
  paid_method: PaidMethod | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}
