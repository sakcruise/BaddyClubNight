import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Check, CalendarPlus, Users, MapPin, Clock, CheckCircle2, XCircle, HelpCircle, Play, Share2, Pencil, Trophy, Swords, CalendarCheck } from "lucide-react";
import { useGroupStore, useSessionStore, useMemberStore, useAuthStore } from "../store";
import { groupsApi } from "../services/groups";
import { supabase } from "../lib/supabase";
import type { MemberType, Member, Session, GroupSession, Match } from "../types";
import { v4 as uuid } from "uuid";
import { computeLeaderboard } from "../utils/scoring";
import SessionScheduleModal from "../components/groups/SessionScheduleModal";
import InviteMembers from "../components/groups/InviteMembers";

/** Map a Supabase matches row → Match (mirrors the api.ts mapper, used for group stats). */
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

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};


function getCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Starting now!";
  const totalSecs = Math.floor(diff / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hrs   = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600)  / 60);
  const secs  = totalSecs % 60;
  if (days > 0)  return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0)   return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function useCountdownTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function formatScheduled(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return { dayLabel, time };
}

export default function GroupDetailView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { groups, upsertGroup, setGroups } = useGroupStore();
  const { setSession, setCourts, session: activeSession } = useSessionStore();
  const { setMembers } = useMemberStore();

  const group = groups.find((g) => g.id === id);

  const [loading, setLoading]           = useState(!group);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [modalBusy, setModalBusy]       = useState(false);
  const [upcomingSessions, setUpcomingSessions] = useState<GroupSession[]>([]);
  const [myMemberId, setMyMemberId]     = useState<string | null>(null);
  const [copiedSession, setCopiedSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<GroupSession | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [groupMatches, setGroupMatches] = useState<Match[]>([]);
  const [sessionsPlayed, setSessionsPlayed] = useState(0);

  useCountdownTick(); // re-renders every second to keep countdowns live

  // Only the group's owner (the signed-in UUID matching owner_id) sees controls.
  const isOwner = !!currentUserId && group?.owner_id === currentUserId;
  const displayName = useAuthStore((s) => s.displayName);

  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    groupsApi.get(id)
      .then((g) => { if (g) upsertGroup(g); })
      .catch((e) => console.error("Failed to load group:", e))
      .finally(() => setLoading(false));
    // Load upcoming sessions and my member id
    groupsApi.listSessions(id).then(setUpcomingSessions).catch((e) => console.error("listSessions failed:", e));
    groupsApi.myMemberId(id).then(setMyMemberId).catch((e) => console.error("myMemberId failed:", e));
    // Lifetime stats: all matches + how many sessions have been played
    supabase.from("matches").select("*").eq("group_id", id)
      .then(({ data }) => setGroupMatches((data ?? []).map(rowToMatch)))
      .then(undefined, (e) => console.error("group matches failed:", e));
    supabase.from("sessions").select("id", { count: "exact", head: true })
      .eq("group_id", id).in("status", ["completed", "ended"])
      .then(({ count }) => setSessionsPlayed(count ?? 0))
      .then(undefined, (e) => console.error("sessions count failed:", e));
  }, [id]);

  // Mini leaderboard from completed group matches (names resolved from the roster).
  const completedMatches = useMemo(() => groupMatches.filter((m) => m.result === "complete"), [groupMatches]);
  const topPlayers = useMemo(() => {
    if (!group || completedMatches.length === 0) return [];
    const roster: Record<string, Member> = {};
    group.members.forEach((m) => {
      roster[m.id] = { id: m.id, name: m.name, member_type: m.member_type, email: "", created_at: m.created_at };
    });
    return computeLeaderboard(completedMatches, roster).slice(0, 3);
  }, [completedMatches, group]);

  async function refresh() {
    if (!id) return;
    const g = await groupsApi.get(id);
    if (g) upsertGroup(g);
  }

  async function refreshSessions() {
    if (!id) return;
    groupsApi.listSessions(id).then(setUpcomingSessions).catch(() => {});
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-900)), rgb(var(--p-600)))" }}>
        <div className="w-9 h-9 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-900)), rgb(var(--p-600)))" }}>
        <p className="text-white font-display font-black text-xl">Group not found</p>
        <button onClick={() => navigate("/groups")} className="px-4 py-2 rounded-xl bg-white text-purple-600 font-display font-bold">
          Back to groups
        </button>
      </div>
    );
  }

  const inviteLink = `${window.location.origin}/groups/join/${group.invite_token}`;

  async function handleRemoveMember(memberId: string) {
    try {
      await groupsApi.removeMember(memberId);
      await refresh();
    } catch (e: any) {
      alert(`Couldn't remove member: ${e?.message ?? "unknown error"}`);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group!.name}"? This can't be undone.`)) return;
    try {
      await groupsApi.remove(group!.id);
      setGroups(useGroupStore.getState().groups.filter((g) => g.id !== group!.id));
      navigate("/groups");
    } catch (e: any) {
      alert(`Couldn't delete group: ${e?.message ?? "unknown error"}`);
    }
  }

  function launchSession(sessionId: string | undefined, numCourts: number, venue?: string, scheduledAt?: string) {
    const g = group!;
    const members: Member[] = g.members.map((m) => ({
      id: m.id,
      name: m.name,
      member_type: m.member_type,
      email: "",
      created_at: m.created_at,
    }));
    setMembers(members);
    const session: Session = {
      id: sessionId ?? uuid(),
      club_name: g.name,
      num_courts: numCourts,
      date: new Date().toISOString().split("T")[0],
      status: "active",
      group_id: g.id,
      scheduled_at: scheduledAt,
      venue,
      created_at: new Date().toISOString(),
    };
    setSession(session);
    setCourts(Array.from({ length: numCourts }, (_, i) => ({ id: i + 1, status: "idle" as const })));
    navigate("/");
  }

  async function handleModalConfirm({ scheduled_at, venue, num_courts, startNow }: {
    scheduled_at: string; venue: string; num_courts: number; startNow: boolean;
  }) {
    setModalBusy(true);
    try {
      if (startNow) {
        // Create active session directly
        const s = await groupsApi.createSession(group!.id, group!.name, {
          scheduled_at, venue, num_courts, status: "active",
        });
        setShowModal(false);
        launchSession(s.id, num_courts, venue, scheduled_at);
      } else {
        // Save as upcoming — don't launch yet
        const s = await groupsApi.createSession(group!.id, group!.name, {
          scheduled_at, venue, num_courts, status: "upcoming",
        });
        setUpcomingSessions((prev) => [...prev, s]);
        setShowModal(false);
      }
    } catch (e: any) {
      alert(`Couldn't create session: ${e?.message ?? "unknown error"}`);
    } finally {
      setModalBusy(false);
    }
  }

  async function handleEditConfirm({ scheduled_at, venue, num_courts }: {
    scheduled_at: string; venue: string; num_courts: number; startNow: boolean;
  }) {
    if (!editingSession) return;
    setEditBusy(true);
    try {
      await groupsApi.updateSession(editingSession.id, { scheduled_at, venue, num_courts });
      setUpcomingSessions((prev) =>
        prev.map((s) =>
          s.id === editingSession.id
            ? { ...s, scheduled_at, venue: venue || undefined, num_courts }
            : s
        )
      );
      setEditingSession(null);
    } catch (e: any) {
      alert(`Couldn't update session: ${e?.message ?? "unknown error"}`);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleActivateSession(s: GroupSession) {
    try {
      await groupsApi.activateSession(s.id);
      launchSession(s.id, s.num_courts, s.venue, s.scheduled_at);
    } catch (e: any) {
      alert(`Couldn't activate session: ${e?.message ?? "unknown error"}`);
    }
  }

  async function handleRsvp(sessionId: string, status: "yes" | "no" | "maybe") {
    if (!myMemberId) return;
    try {
      await groupsApi.rsvp(sessionId, myMemberId, status);
      await refreshSessions();
    } catch (e: any) {
      alert(`RSVP failed: ${e?.message ?? "unknown error"}`);
    }
  }

  const nextSession = upcomingSessions[0] ?? null;

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}>

      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-5 pb-3 flex-shrink-0">
        <button onClick={() => navigate("/groups")} className="p-2 rounded-xl bg-white/15 border border-white/20 text-white flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-black text-white text-lg leading-tight truncate">{group.name}</h1>
          <p className="text-white/50 text-xs font-display">{group.members.length} members · {group.num_courts} court{group.num_courts > 1 ? "s" : ""}</p>
        </div>
        {/* Display name avatar */}
        {displayName && (
          <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0" title={displayName}>
            <span className="font-display font-black text-white text-sm">{displayName.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {isOwner && (
          <button onClick={handleDeleteGroup} className="p-2 rounded-xl bg-white/10 border border-white/20 text-white/60 flex-shrink-0">
            <Trash2 size={15} />
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-28 max-w-xl w-full mx-auto flex flex-col gap-3">

        {/* Resume active session banner */}
        {activeSession?.group_id === id && activeSession?.status === "active" && (
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
        )}

        {/* ── STATS STRIP ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Users size={16} />, value: group.members.length, label: group.members.length === 1 ? "Member" : "Members", grad: "from-purple-500 to-purple-400" },
            { icon: <CalendarCheck size={16} />, value: sessionsPlayed, label: sessionsPlayed === 1 ? "Session" : "Sessions", grad: "from-blue-500 to-blue-400" },
            { icon: <Swords size={16} />, value: completedMatches.length, label: completedMatches.length === 1 ? "Game" : "Games", grad: "from-orange-500 to-orange-400" },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl bg-gradient-to-br ${s.grad} p-3 text-white shadow-lg shadow-black/10 flex flex-col gap-1`}>
              <div className="opacity-80">{s.icon}</div>
              <div className="font-display font-black text-2xl leading-none tabular-nums">{s.value}</div>
              <div className="text-[10px] font-display font-bold uppercase tracking-wider opacity-80">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── SESSION HERO ── */}
        {nextSession ? (() => {
          const { dayLabel, time } = formatScheduled(nextSession.scheduled_at);
          const myRsvp = nextSession.rsvps.find((r) => r.member_id === myMemberId);
          const goingCount = nextSession.going_count;
          return (
            <div className="bg-white rounded-3xl shadow-xl shadow-black/20 overflow-hidden">
              {/* Coloured top bar */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarPlus size={15} className="text-white/80" />
                  <span className="font-display font-black text-white text-xs uppercase tracking-wider">
                    {nextSession.status === "active" ? "Session in progress" : "Next session"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {goingCount > 0 && (
                    <span className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5 text-white font-display font-bold text-xs">
                      <CheckCircle2 size={11} /> {goingCount} going
                    </span>
                  )}
                  {isOwner && (
                    <button onClick={() => setEditingSession(nextSession)} className="p-1 rounded-lg bg-white/15 text-white/80 hover:bg-white/25 transition-all">
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 flex flex-col gap-3">
                {/* Date / time / venue / courts */}
                <div>
                  <p className="font-display font-black text-gray-900 text-xl leading-tight">{dayLabel}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-gray-500 text-sm font-display font-bold">
                      <Clock size={13} /> {time}
                    </span>
                    {nextSession.venue && (
                      <span className="flex items-center gap-1 text-gray-500 text-sm font-display font-bold">
                        <MapPin size={13} /> {nextSession.venue}
                      </span>
                    )}
                    <span className="text-gray-400 text-sm font-display">{nextSession.num_courts} court{nextSession.num_courts > 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Countdown */}
                {nextSession.status === "upcoming" && (
                  <div className="flex items-center gap-2 bg-purple-50 rounded-2xl px-3 py-2.5">
                    <Clock size={14} className="text-purple-500 flex-shrink-0" />
                    <span className="font-display font-black text-purple-700 text-base tabular-nums">{getCountdown(nextSession.scheduled_at)}</span>
                    <span className="text-purple-400 text-xs font-display ml-auto">until session</span>
                  </div>
                )}

                {/* RSVP */}
                {myMemberId && nextSession.status === "upcoming" && (
                  <div className="flex gap-2">
                    {(["yes", "maybe", "no"] as const).map((st) => {
                      const cfg = {
                        yes:   { icon: <CheckCircle2 size={15} />, label: "Going",  active: "bg-green-500 text-white border-green-500"  },
                        maybe: { icon: <HelpCircle   size={15} />, label: "Maybe",  active: "bg-yellow-400 text-white border-yellow-400" },
                        no:    { icon: <XCircle      size={15} />, label: "Can't",  active: "bg-red-500 text-white border-red-500"       },
                      }[st];
                      return (
                        <button key={st} onClick={() => handleRsvp(nextSession.id, st)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 font-display font-black text-sm transition-all active:scale-95
                            ${myRsvp?.status === st ? cfg.active : "border-gray-200 text-gray-500 bg-white"}`}>
                          {cfg.icon} {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Owner: start + share */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/sessions/${nextSession.id}/rsvp`;
                      navigator.clipboard?.writeText(link).then(() => {
                        setCopiedSession(nextSession.id);
                        setTimeout(() => setCopiedSession(null), 1800);
                      });
                    }}
                    className="flex items-center gap-1.5 text-xs font-display font-bold text-purple-500 py-1">
                    {copiedSession === nextSession.id ? <><Check size={12} />Copied!</> : <><Share2 size={12} />Share RSVP link</>}
                  </button>
                  {nextSession.status === "active" && (
                    <button onClick={() => launchSession(nextSession.id, nextSession.num_courts, nextSession.venue, nextSession.scheduled_at)}
                      className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500 text-white font-display font-black text-sm active:scale-95 transition-all shadow-md shadow-green-500/30">
                      <Play size={14} /> Enter session
                    </button>
                  )}
                  {isOwner && nextSession.status === "upcoming" && (
                    <button onClick={() => handleActivateSession(nextSession)}
                      className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-display font-black text-sm active:scale-95 transition-all shadow-md shadow-purple-500/30">
                      <Play size={14} /> Start now
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })() : (
          /* No session yet */
          <div className="bg-white/10 border border-white/20 rounded-3xl p-5 flex items-center gap-3">
            <CalendarPlus size={20} className="text-white/50 flex-shrink-0" />
            <div>
              <p className="font-display font-black text-white text-sm">No upcoming session</p>
              {isOwner && <p className="text-white/50 text-xs font-display mt-0.5">Tap "Schedule Session" below to set one up.</p>}
            </div>
          </div>
        )}

        {/* Additional future sessions (if more than one) */}
        {upcomingSessions.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs font-display font-bold uppercase tracking-wider px-1">Also scheduled</p>
            {upcomingSessions.slice(1).map((s) => {
              const { dayLabel, time } = formatScheduled(s.scheduled_at);
              return (
                <div key={s.id} className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-white text-sm">{dayLabel} <span className="font-normal text-white/60">{time}</span></p>
                    {s.venue && <p className="text-white/50 text-xs font-display truncate">{s.venue}</p>}
                  </div>
                  <span className="text-white/50 text-xs font-display tabular-nums">{getCountdown(s.scheduled_at)}</span>
                  {isOwner && (
                    <button onClick={() => setEditingSession(s)} className="p-1.5 rounded-lg bg-white/10 text-white/60">
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TOP PLAYERS ── */}
        {topPlayers.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg shadow-black/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Trophy size={15} className="text-amber-500" />
              <span className="font-display font-black text-gray-900 text-sm">Top Players</span>
              <span className="ml-auto text-[10px] font-display font-bold text-gray-400 uppercase tracking-wider">all time</span>
            </div>
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {topPlayers.map((p, idx) => {
                const medal = ["🥇", "🥈", "🥉"][idx];
                return (
                  <div key={p.member_id} className="flex items-center gap-3 px-2 py-2 rounded-xl bg-gray-50">
                    <span className="text-lg w-6 text-center">{medal}</span>
                    <span className={`w-8 h-8 rounded-full ${TYPE_DOT[p.member?.member_type ?? "male"]} flex items-center justify-center text-white font-display font-black text-xs flex-shrink-0`}>
                      {(p.member?.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{p.member?.name ?? "Unknown"}</span>
                    <span className="badge bg-green-100 text-green-700 text-xs px-2 py-0.5 font-black">{p.wins}W</span>
                    <span className="badge bg-gray-200 text-gray-500 text-xs px-2 py-0.5 font-black">{p.matches_played} GP</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MEMBERS ── */}
        <div className="bg-white rounded-3xl shadow-lg shadow-black/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <Users size={15} className="text-purple-600" />
            <span className="font-display font-black text-gray-900 text-sm">Members</span>
            <span className="ml-auto text-xs font-display font-bold text-gray-400">{group.members.length}</span>
          </div>

          {/* Avatar row */}
          {group.members.length > 0 && (
            <div className="flex gap-2 px-4 pb-3 flex-wrap">
              {group.members.map((m) => (
                <div key={m.id} className={`w-10 h-10 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-sm border-2 border-white shadow-sm`}
                  title={m.name}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}

          {/* Member list */}
          <div className="border-t border-gray-100">
            {group.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                <span className={`w-8 h-8 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-xs flex-shrink-0`}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{m.name}</span>
                <span className="text-gray-300 text-xs font-display capitalize">{m.member_type}</span>
                {isOwner && (
                  <button onClick={() => handleRemoveMember(m.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors ml-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {group.members.length === 0 && (
              <p className="text-gray-400 text-sm font-display text-center py-6">
                Just you so far — invite friends below.
              </p>
            )}
          </div>
        </div>

        {/* ── INVITE MEMBERS (owner) ── */}
        {isOwner && <InviteMembers inviteLink={inviteLink} groupName={group.name} variant="dark" />}

      </main>

      {/* Bottom button — owner only */}
      {isOwner && (
        <div className="fixed bottom-0 left-0 right-0 p-4 max-w-xl mx-auto">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowModal(true)}
            className="w-full py-4 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 shadow-2xl shadow-purple-500/30 flex items-center justify-center gap-2">
            <CalendarPlus size={20} />
            Schedule / Start Session
          </motion.button>
        </div>
      )}

      {/* Session schedule modal */}
      {showModal && (
        <SessionScheduleModal
          defaultVenue={group.venue}
          defaultCourts={group.num_courts}
          onConfirm={handleModalConfirm}
          onClose={() => setShowModal(false)}
          busy={modalBusy}
        />
      )}

      {editingSession && (
        <SessionScheduleModal
          editMode
          defaultVenue={editingSession.venue}
          defaultCourts={editingSession.num_courts}
          defaultDatetime={editingSession.scheduled_at ? new Date(editingSession.scheduled_at).toISOString().slice(0, 16) : undefined}
          onConfirm={handleEditConfirm}
          onClose={() => setEditingSession(null)}
          busy={editBusy}
        />
      )}
    </div>
  );
}
