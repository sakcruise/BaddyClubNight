import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Session, Court, QueuePosition, Match, Member, PickerState, SyncState,
} from "../types";
import { normalisePositions } from "../utils/queueLogic";

// ─── Auth Store ───────────────────────────────────────────────────────────────

interface AuthStore {
  token: string | null;
  username: string | null;     // login ID, e.g. "oasisbadminton"
  displayName: string | null;  // shown in UI, e.g. "Oasis Badminton Club"
  adminName: string | null;    // admin person's name, e.g. "Sakthi"
  email: string | null;        // for password reset only, not shown in UI
  setAuth: (token: string, username: string, displayName: string, adminName: string, email: string) => void;
  setProfile: (username: string, displayName: string, adminName: string, email: string) => void;
  clearProfile: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      displayName: null,
      adminName: null,
      email: null,
      setAuth: (token, username, displayName, adminName, email) =>
        set({ token, username, displayName, adminName, email }),
      setProfile: (username, displayName, adminName, email) =>
        set({ username, displayName, adminName, email }),
      clearProfile: () => set({ token: null, username: null, displayName: null, adminName: null, email: null }),
    }),
    { name: "auth-store" }
  )
);

// ─── Session Store ────────────────────────────────────────────────────────────

export interface ClubConfig {
  name: string;
  venue: string;
  nightDay: string;       // e.g. "Friday"
  nightStart: string;     // e.g. "19:00"
  nightEnd: string;       // e.g. "22:00"
  whatsapp: string;       // URL or phone number
  themeKey: string;       // e.g. "orange" | "blue" | "green" etc.
  shuttleTubePrice: number;    // £ per tube, e.g. 2.50
  shuttleBudgetTubes: number;  // tubes budgeted per night, e.g. 10
}

interface SessionStore {
  session: Session | null;
  courts: Court[];
  clubName: string;          // quick-access alias for clubConfig.name
  clubConfig: ClubConfig;
  setSession: (s: Session) => void;
  setCourts: (courts: Court[]) => void;
  updateCourtStatus: (courtId: number, status: Court["status"], matchId?: string) => void;
  endSession: () => void;
  setClubName: (name: string) => void;
  setClubConfig: (cfg: Partial<ClubConfig>) => void;
}

const defaultClubConfig: ClubConfig = {
  name: "",
  venue: "",
  nightDay: "Friday",
  nightStart: "19:00",
  nightEnd: "22:00",
  whatsapp: "",
  themeKey: "orange",
  shuttleTubePrice: 2.50,
  shuttleBudgetTubes: 10,
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      session: null,
      courts: [],
      clubName: "",
      clubConfig: defaultClubConfig,
      setSession: (session) => set({ session }),
      setCourts: (courts) => set({ courts }),
      updateCourtStatus: (courtId, status, matchId) =>
        set((s) => ({
          courts: s.courts.map((c) =>
            c.id === courtId ? { ...c, status, current_match_id: matchId } : c
          ),
        })),
      endSession: () => {
        set({ session: null, courts: [] });
        // Also wipe queue and matches so stale data never leaks into the next session
        useQueueStore.getState().setQueue([]);
        useQueueStore.getState().setActiveMemberIds(new Set());
        useMatchStore.getState().setMatches([]);
      },
      setClubName: (clubName) =>
        set((s) => ({ clubName, clubConfig: { ...s.clubConfig, name: clubName } })),
      setClubConfig: (patch) =>
        set((s) => ({
          clubConfig: { ...s.clubConfig, ...patch },
          // keep clubName in sync
          clubName: patch.name !== undefined ? patch.name : s.clubName,
        })),
    }),
    {
      name: "session-store",
      // Deep-merge so new fields (clubConfig) don't get wiped by old persisted state
      merge: (persisted: unknown, current) => ({
        ...current,
        ...(persisted as object),
        // Always ensure clubConfig has all keys (handles old localStorage without it)
        clubConfig: {
          ...defaultClubConfig,
          ...((persisted as { clubConfig?: Partial<ClubConfig> })?.clubConfig ?? {}),
        },
      }),
    }
  )
);

// ─── Member Store ─────────────────────────────────────────────────────────────

interface MemberStore {
  members: Record<string, Member>;
  setMembers: (members: Member[]) => void;
  addMember: (m: Member) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  deleteMember: (id: string) => void;
}

export const useMemberStore = create<MemberStore>()(
  persist(
    (set) => ({
      members: {},
      setMembers: (members) =>
        set({ members: Object.fromEntries(members.map((m) => [m.id, m])) }),
      addMember: (m) => set((s) => ({ members: { ...s.members, [m.id]: m } })),
      updateMember: (id, patch) =>
        set((s) => ({
          members: { ...s.members, [id]: { ...s.members[id], ...patch } },
        })),
      deleteMember: (id) =>
        set((s) => {
          const next = { ...s.members };
          delete next[id];
          return { members: next };
        }),
    }),
    { name: "member-store" }
  )
);

// ─── Queue Store ──────────────────────────────────────────────────────────────

interface QueueStore {
  queue: QueuePosition[];
  activeMemberIds: Set<string>;
  picker: PickerState;
  setQueue: (q: QueuePosition[]) => void;
  addToQueue: (pos: QueuePosition) => void;
  removeFromQueue: (memberId: string) => void;
  reorderQueue: (q: QueuePosition[]) => void;
  setActiveMemberIds: (ids: Set<string>) => void;
  openPicker: (pickerId: string | null, candidates: QueuePosition[], courtId: number) => void;
  setPickerId: (id: string | null) => void;
  togglePick: (memberId: string) => void;
  closePicker: () => void;
}

const defaultPicker: PickerState = {
  isOpen: false,
  picker_id: null,
  candidates: [],
  picked: [],
  target_court: null,
};

export const useQueueStore = create<QueueStore>()((set) => ({
  queue: [],
  activeMemberIds: new Set(),
  picker: defaultPicker,

  setQueue: (queue) => set({ queue: normalisePositions(queue) }),

  addToQueue: (pos) =>
    set((s) => {
      if (s.queue.some((q) => q.member_id === pos.member_id)) return s;
      return { queue: normalisePositions([...s.queue, pos]) };
    }),

  removeFromQueue: (memberId) =>
    set((s) => ({
      queue: normalisePositions(s.queue.filter((q) => q.member_id !== memberId)),
    })),

  reorderQueue: (queue) => set({ queue: normalisePositions(queue) }),

  setActiveMemberIds: (ids) => set({ activeMemberIds: ids }),

  openPicker: (pickerId, candidates, courtId) =>
    set({
      picker: {
        isOpen: true,
        picker_id: pickerId,
        candidates,
        picked: [],
        target_court: courtId,
      },
    }),

  setPickerId: (id) =>
    set((s) => ({
      picker: {
        ...s.picker,
        picker_id: id,
        // clear any picks that were for the old picker's team
        picked: [],
      },
    })),

  togglePick: (memberId) =>
    set((s) => {
      const already = s.picker.picked.includes(memberId);
      if (!already && s.picker.picked.length >= 3) return s;
      return {
        picker: {
          ...s.picker,
          picked: already
            ? s.picker.picked.filter((id) => id !== memberId)
            : [...s.picker.picked, memberId],
        },
      };
    }),

  closePicker: () => set({ picker: defaultPicker }),
}));

// ─── Match Store ──────────────────────────────────────────────────────────────

interface MatchStore {
  matches: Match[];
  setMatches: (m: Match[]) => void;
  addMatch: (m: Match) => void;
  updateMatch: (id: string, patch: Partial<Match>) => void;
}

export const useMatchStore = create<MatchStore>()(
  persist(
    (set) => ({
      matches: [],
      setMatches: (matches) => set({ matches }),
      addMatch: (m) => set((s) => ({ matches: [...s.matches, m] })),
      updateMatch: (id, patch) =>
        set((s) => ({
          matches: s.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
    }),
    { name: "match-store" }
  )
);

// ─── Sync Store ───────────────────────────────────────────────────────────────

interface SyncStore {
  sync: SyncState;
  setSyncStatus: (s: Partial<SyncState>) => void;
}

export const useSyncStore = create<SyncStore>()((set) => ({
  sync: { pending_changes: 0, status: "idle" },
  setSyncStatus: (patch) =>
    set((s) => ({ sync: { ...s.sync, ...patch } })),
}));
