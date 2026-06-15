import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Users, ChevronRight, X, LogOut, Calendar, Clock, Zap,
  Play, MapPin, Activity, Swords, CalendarCheck,
} from "lucide-react";
import { useGroupStore, useAuthStore, useSessionStore } from "../store";
import { authApi } from "../services/api";
import { groupsApi } from "../services/groups";
import { supabase } from "../lib/supabase";
import type { GroupSession, MemberType } from "../types";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};

interface RecentMatch {
  id: string;
  groupId: string;
  groupName: string;
  teamA: string[];
  teamB: string[];
  scoreA?: number;
  scoreB?: number;
  endedAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function sessionLabel(s: GroupSession, isPast: boolean): { icon: React.ReactNode; text: string; color: string } {
  if (s.status === "active") return { icon: <Zap size={11} />, text: "Happening now!", color: "text-green-600 bg-green-50" };
  const d = new Date(s.scheduled_at ?? s.created_at);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr =
    diffDays === 0 ? "Today"
    : diffDays === 1 ? "Tomorrow"
    : diffDays === -1 ? "Yesterday"
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if (isPast) return { icon: <Clock size={11} />, text: `Last: ${dateStr}`, color: "text-gray-400 bg-gray-50" };
  return { icon: <Calendar size={11} />, text: `${dateStr} · ${time}`, color: "text-purple-600 bg-purple-50" };
}

/** Splitwise-style home: the list of friends-groups this person belongs to. */
export default function GroupsHomeView() {
  const navigate = useNavigate();
  const { groups, setGroups } = useGroupStore();
  const displayName = useAuthStore((s) => s.displayName);
  const adminName = useAuthStore((s) => s.adminName);
  const activeSession = useSessionStore((s) => s.session);

  const [loading, setLoading] = useState(true);
  const [featuredSessions, setFeaturedSessions] = useState<Record<string, { session: GroupSession; isPast: boolean } | null>>({});
  const [globalStats, setGlobalStats] = useState({ sessions: 0, games: 0 });
  const [groupStats, setGroupStats] = useState<Record<string, { games: number; sessions: number }>>({});
  const [recentActivity, setRecentActivity] = useState<RecentMatch[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [courts, setCourts] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    groupsApi.list()
      .then(async (gs) => {
        setGroups(gs);

        // Featured session per group (upcoming first, fall back to last completed)
        gs.forEach(async (g) => {
          try {
            const upcoming = await groupsApi.listSessions(g.id);
            if (upcoming.length > 0) {
              setFeaturedSessions((prev) => ({ ...prev, [g.id]: { session: upcoming[0], isPast: false } }));
              return;
            }
            const { data } = await supabase
              .from("sessions")
              .select("id, group_id, club_name, scheduled_at, venue, num_courts, status, created_at")
              .eq("group_id", g.id)
              .eq("status", "completed")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) {
              const past: GroupSession = {
                id: data.id, group_id: data.group_id, club_name: data.club_name,
                scheduled_at: data.scheduled_at ?? data.created_at, venue: data.venue,
                num_courts: data.num_courts, status: data.status, created_at: data.created_at,
                rsvps: [], going_count: 0,
              };
              setFeaturedSessions((prev) => ({ ...prev, [g.id]: { session: past, isPast: true } }));
            } else {
              setFeaturedSessions((prev) => ({ ...prev, [g.id]: null }));
            }
          } catch {
            setFeaturedSessions((prev) => ({ ...prev, [g.id]: null }));
          }
        });

        // Global stats + activity feed (only when there are groups to query)
        if (gs.length > 0) {
          const groupIds = gs.map((g) => g.id);

          // Build member-id → name lookup from the already-loaded rosters
          const memberMap: Record<string, string> = {};
          gs.forEach((g) => g.members.forEach((m) => { memberMap[m.id] = m.name; }));

          try {
            const [matchResult, sessionResult] = await Promise.all([
              supabase
                .from("matches")
                .select("id, group_id, team_a_1, team_a_2, team_b_1, team_b_2, score_a, score_b, ended_at, created_at")
                .in("group_id", groupIds)
                .eq("result", "complete")
                .order("ended_at", { ascending: false })
                .limit(200),
              supabase
                .from("sessions")
                .select("id, group_id")
                .in("group_id", groupIds)
                .in("status", ["completed", "ended"]),
            ]);

            const matches = matchResult.data ?? [];
            const sessions = sessionResult.data ?? [];

            // Per-group and global counts
            const gStats: Record<string, { games: number; sessions: number }> = {};
            gs.forEach((g) => { gStats[g.id] = { games: 0, sessions: 0 }; });
            matches.forEach((m) => { if (gStats[m.group_id]) gStats[m.group_id].games++; });
            sessions.forEach((s) => { if (gStats[s.group_id]) gStats[s.group_id].sessions++; });
            setGroupStats(gStats);
            setGlobalStats({ games: matches.length, sessions: sessions.length });

            // Activity feed — 10 most recent matches
            const activity: RecentMatch[] = matches.slice(0, 10).map((m) => ({
              id: m.id,
              groupId: m.group_id,
              groupName: gs.find((g) => g.id === m.group_id)?.name ?? "Unknown",
              teamA: [m.team_a_1, m.team_a_2].map((id) => memberMap[id] ?? "").filter((n) => n.length > 0),
              teamB: [m.team_b_1, m.team_b_2].map((id) => memberMap[id] ?? "").filter((n) => n.length > 0),
              scoreA: m.score_a ?? undefined,
              scoreB: m.score_b ?? undefined,
              endedAt: m.ended_at ?? m.created_at,
            }));
            setRecentActivity(activity);
          } catch (e) {
            console.error("Failed to load group stats:", e);
          }
        }
      })
      .catch((e) => console.error("Failed to load groups:", e))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const ownerName = adminName?.trim() || displayName?.trim() || "Me";
      const created = await groupsApi.create(name, { num_courts: courts });
      if (created.members.length === 0) {
        try {
          const member = await groupsApi.addMember(created.id, ownerName);
          created.members = [member];
        } catch { /* non-fatal */ }
      }
      useGroupStore.getState().upsertGroup(created);
      setName("");
      setCreating(false);
      navigate(`/groups/${created.id}`);
    } catch (e: any) {
      alert(`Couldn't create group: ${e?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const firstName = (adminName?.trim() || displayName?.trim() || "there").split(" ")[0];
  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0);

  const nextUp = (() => {
    const candidates = Object.entries(featuredSessions)
      .map(([gid, f]) => (f && !f.isPast ? { gid, session: f.session } : null))
      .filter((c): c is { gid: string; session: GroupSession } =>
        !!c && (c.session.status === "active" || c.session.status === "upcoming"))
      .sort((a, b) => new Date(a.session.scheduled_at).getTime() - new Date(b.session.scheduled_at).getTime());
    return candidates[0] ?? null;
  })();
  const nextUpGroup = nextUp ? groups.find((g) => g.id === nextUp.gid) : null;
  const nextUpWhen = nextUp ? sessionLabel(nextUp.session, false) : null;

  const hasStats = !loading && (globalStats.games > 0 || globalStats.sessions > 0);

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={28} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-lg leading-tight">Hey {firstName} 👋</h1>
            <p className="text-orange-200 text-xs font-display">
              {groups.length > 0
                ? `${groups.length} group${groups.length > 1 ? "s" : ""} · ${totalMembers} player${totalMembers !== 1 ? "s" : ""}`
                : "Play with friends"}
            </p>
          </div>
        </div>
        {/* Avatar button → settings sheet */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-display font-black text-base hover:bg-white/30 active:scale-95 transition-all"
          title="Account settings"
        >
          {firstName.charAt(0).toUpperCase()}
        </button>
      </header>

      {/* ── Resume active session banner ───────────────────────────────────── */}
      {activeSession?.group_id && activeSession.status === "active" && (
        <div className="px-5 max-w-xl w-full mx-auto pt-1">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 bg-green-500 text-white rounded-2xl px-4 py-3 shadow-lg shadow-green-500/30 active:scale-95 transition-all"
          >
            <Play size={18} className="flex-shrink-0" />
            <div className="flex-1 text-left">
              <p className="font-display font-black text-sm leading-tight">Session in progress</p>
              <p className="text-green-100 text-xs font-display">Tap to resume courts &amp; scores →</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Global stats strip ─────────────────────────────────────────────── */}
      {hasStats && (
        <div className="px-5 max-w-xl w-full mx-auto mt-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Users size={13} />, value: totalMembers, label: "Players" },
              { icon: <CalendarCheck size={13} />, value: globalStats.sessions, label: "Sessions" },
              { icon: <Swords size={13} />, value: globalStats.games, label: "Games" },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 flex items-center gap-2 backdrop-blur-sm"
              >
                <span className="text-white/50 flex-shrink-0">{s.icon}</span>
                <span className="font-display font-black text-white text-sm tabular-nums">{s.value}</span>
                <span className="text-white/50 text-xs font-display truncate">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main scrollable content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-5 pb-28 max-w-xl w-full mx-auto">

        {/* Next-up hero — soonest game across all groups */}
        {!loading && nextUp && nextUpGroup && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/groups/${nextUp.gid}`)}
            className="w-full bg-white rounded-2xl p-4 mb-3 mt-3 shadow-xl shadow-black/20 text-left flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-display font-black ${nextUpWhen?.color}`}>
                {nextUpWhen?.icon} {nextUp.session.status === "active" ? "Happening now!" : "Next up"}
              </span>
              <span className="ml-auto text-purple-500 text-xs font-display font-bold">{nextUpGroup.name} →</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {nextUp.session.status !== "active" && (
                <span className="font-display font-black text-gray-900 text-lg leading-none">{nextUpWhen?.text}</span>
              )}
              {nextUp.session.venue && (
                <span className="flex items-center gap-1 text-gray-500 text-sm font-display font-bold">
                  <MapPin size={13} /> {nextUp.session.venue}
                </span>
              )}
              {nextUp.session.going_count > 0 && (
                <span className="text-gray-400 text-sm font-display">{nextUp.session.going_count} going</span>
              )}
            </div>
          </motion.button>
        )}

        {/* ── Group list ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center mt-24">
            <div className="w-9 h-9 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-20 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Users size={30} className="text-white" />
            </div>
            <p className="text-white font-display font-black text-xl">No groups yet</p>
            <p className="text-orange-200 text-sm font-display max-w-xs">
              Create a group for your weekend crew, add your friends, and start playing.
            </p>
          </div>
        ) : (
          <>
            <div className={`flex flex-col gap-3 ${nextUp ? "" : "mt-3"}`}>
              {groups.map((g) => {
                const featured = featuredSessions[g.id];
                const label = featured ? sessionLabel(featured.session, featured.isPast) : null;
                const stats = groupStats[g.id];
                return (
                  <motion.button
                    key={g.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/groups/${g.id}`)}
                    className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-lg shadow-black/10 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Name + session label */}
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black text-gray-900 text-base truncate">{g.name}</span>
                        {label && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-display font-bold flex-shrink-0 ${label.color}`}>
                            {label.icon} {label.text}
                          </span>
                        )}
                      </div>

                      {/* Member avatars + per-group stats */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {g.members.length > 0 ? (
                          <div className="flex -space-x-2 flex-shrink-0">
                            {g.members.slice(0, 5).map((m) => (
                              <span
                                key={m.id}
                                className={`w-6 h-6 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-[10px] border-2 border-white`}
                                title={m.name}
                              >
                                {m.name.charAt(0).toUpperCase()}
                              </span>
                            ))}
                            {g.members.length > 5 && (
                              <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-display font-black text-[9px] border-2 border-white">
                                +{g.members.length - 5}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs font-display">No members yet</span>
                        )}
                        <span className="text-gray-300 text-[10px]">·</span>
                        <span className="text-gray-400 text-xs font-display">{g.num_courts} court{g.num_courts > 1 ? "s" : ""}</span>
                        {stats?.sessions > 0 && (
                          <>
                            <span className="text-gray-300 text-[10px]">·</span>
                            <span className="text-gray-400 text-xs font-display">{stats.sessions} session{stats.sessions !== 1 ? "s" : ""}</span>
                          </>
                        )}
                        {stats?.games > 0 && (
                          <>
                            <span className="text-gray-300 text-[10px]">·</span>
                            <span className="text-gray-400 text-xs font-display">{stats.games} game{stats.games !== 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                  </motion.button>
                );
              })}
            </div>

            {/* ── Activity Feed ──────────────────────────────────────────── */}
            {recentActivity.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-white/40" />
                  <span className="text-white/40 text-xs font-display font-bold uppercase tracking-wider">Recent Activity</span>
                </div>
                <div className="flex flex-col gap-2">
                  {recentActivity.map((match) => {
                    const hasScores = match.scoreA != null && match.scoreB != null;
                    const aWon = hasScores && match.scoreA! > match.scoreB!;
                    const bWon = hasScores && match.scoreB! > match.scoreA!;
                    const teamAStr = match.teamA.join(" & ") || "Team A";
                    const teamBStr = match.teamB.join(" & ") || "Team B";
                    return (
                      <motion.button
                        key={match.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate(`/groups/${match.groupId}`)}
                        className="bg-white/8 border border-white/12 rounded-2xl px-4 py-3 text-left"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-display font-black text-purple-300 uppercase tracking-wider">{match.groupName}</span>
                          <span className="text-[10px] font-display text-white/35">{timeAgo(match.endedAt)}</span>
                        </div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`font-display font-bold text-sm leading-tight ${aWon ? "text-white" : "text-white/45"}`}>
                            {teamAStr}
                          </span>
                          <span className={`font-display font-black text-xs tabular-nums flex-shrink-0 ${hasScores ? "text-white/55" : "text-white/35"}`}>
                            {hasScores
                              ? `${aWon ? "def." : bWon ? "lost to" : "drew"} ${match.scoreA}–${match.scoreB}`
                              : "vs"}
                          </span>
                          <span className={`font-display font-bold text-sm leading-tight ${bWon ? "text-white" : "text-white/45"}`}>
                            {teamBStr}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Create FAB ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white shadow-2xl shadow-black/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={26} className="text-purple-600" />
      </button>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {/* Create group sheet */}
        {creating && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCreating(false)}
            />
            <motion.div
              className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl p-5 pb-8 max-w-xl mx-auto"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="font-display font-black text-gray-900 text-lg">New Group</span>
                <button onClick={() => setCreating(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                  <X size={18} />
                </button>
              </div>

              <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Group Name</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Saturday Smashers"
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-display font-bold text-gray-900 focus:outline-none focus:border-purple-400 transition-colors mb-4"
              />

              <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Courts</label>
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => setCourts((n) => Math.max(1, n - 1))}
                  className="w-11 h-11 rounded-xl bg-purple-100 border-2 border-purple-200 font-display font-black text-xl text-purple-600 active:scale-95 transition-all">−</button>
                <div className="flex-1 h-11 rounded-xl border-2 border-purple-300 text-center flex items-center justify-center font-display font-black text-2xl text-purple-600">{courts}</div>
                <button onClick={() => setCourts((n) => Math.min(10, n + 1))}
                  className="w-11 h-11 rounded-xl bg-purple-100 border-2 border-purple-200 font-display font-black text-xl text-purple-600 active:scale-95 transition-all">+</button>
              </div>

              <button
                onClick={handleCreate}
                disabled={!name.trim() || saving}
                className="w-full py-3 rounded-xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-purple-500/20"
              >
                {saving ? "Creating…" : "Create Group"}
              </button>
            </motion.div>
          </>
        )}

        {/* Account / settings sheet */}
        {showSettings && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl p-5 pb-10 max-w-xl mx-auto"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="font-display font-black text-gray-900 text-lg">Account</span>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                  <X size={18} />
                </button>
              </div>

              {/* Profile card */}
              <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-purple-400 flex items-center justify-center text-white font-display font-black text-2xl flex-shrink-0 shadow-lg shadow-purple-200">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-gray-900 text-base truncate">
                    {adminName?.trim() || displayName?.trim() || "Anonymous"}
                  </p>
                  <p className="text-gray-400 text-xs font-display mt-0.5">Group account</p>
                </div>
              </div>

              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { icon: <Users size={14} className="text-purple-400" />, value: groups.length, label: "Groups" },
                  { icon: <CalendarCheck size={14} className="text-blue-400" />, value: globalStats.sessions, label: "Sessions" },
                  { icon: <Swords size={14} className="text-orange-400" />, value: globalStats.games, label: "Games" },
                ].map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-2xl p-3 text-center flex flex-col items-center gap-1">
                    {s.icon}
                    <div className="font-display font-black text-gray-900 text-xl tabular-nums">{s.value}</div>
                    <div className="text-gray-400 text-[10px] font-display font-bold uppercase tracking-wider">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Sign out */}
              <button
                onClick={() => { authApi.logout(); setShowSettings(false); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-red-50 text-red-500 font-display font-black text-sm active:scale-95 transition-all border border-red-100"
              >
                <LogOut size={15} /> Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
