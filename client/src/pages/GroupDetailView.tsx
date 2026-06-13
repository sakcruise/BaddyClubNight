import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Link2, Check, CalendarPlus, Users, MapPin, Clock, CheckCircle2, XCircle, HelpCircle, Play, Share2, Pencil, UserPlus } from "lucide-react";
import { useGroupStore, useSessionStore, useMemberStore, useAuthStore } from "../store";
import { groupsApi } from "../services/groups";
import { supabase } from "../lib/supabase";
import type { MemberType, Member, Session, GroupSession } from "../types";
import { v4 as uuid } from "uuid";
import SessionScheduleModal from "../components/groups/SessionScheduleModal";

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};

const isGuest = () => localStorage.getItem("friends-guest") === "true";

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
  const { groups, addGroupMember, removeGroupMember, deleteGroup, upsertGroup, setGroups } = useGroupStore();
  const { setSession, setCourts } = useSessionStore();
  const { setMembers } = useMemberStore();

  const group = groups.find((g) => g.id === id);

  const [newName, setNewName]           = useState("");
  const [newType, setNewType]           = useState<MemberType>("male");
  const [copied, setCopied]             = useState(false);
  const [loading, setLoading]           = useState(!isGuest() && !group);
  const [busy, setBusy]                 = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [modalBusy, setModalBusy]       = useState(false);
  const [upcomingSessions, setUpcomingSessions] = useState<GroupSession[]>([]);
  const [myMemberId, setMyMemberId]     = useState<string | null>(null);
  const [copiedSession, setCopiedSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<GroupSession | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(isGuest()); // guests skip auth check

  useCountdownTick(); // re-renders every second to keep countdowns live

  // For Supabase-backed groups (have owner_id), only the UUID owner sees controls.
  // For local guest groups (no owner_id), the guest user is the owner.
  const isOwner = group?.owner_id
    ? (!!currentUserId && group.owner_id === currentUserId)
    : isGuest();
  const displayName = useAuthStore((s) => s.displayName);

  useEffect(() => {
    if (isGuest() || !id) return;
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setAuthLoaded(true);
    });
    groupsApi.get(id)
      .then((g) => { if (g) upsertGroup(g); })
      .catch((e) => console.error("Failed to load group:", e))
      .finally(() => setLoading(false));
    // Load upcoming sessions and my member id
    groupsApi.listSessions(id).then(setUpcomingSessions).catch((e) => console.error("listSessions failed:", e));
    groupsApi.myMemberId(id).then(setMyMemberId).catch((e) => console.error("myMemberId failed:", e));
  }, [id]);

  async function refresh() {
    if (isGuest() || !id) return;
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

  function copyInvite() {
    navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function handleAdd() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      if (isGuest()) {
        addGroupMember(group!.id, newName, newType);
      } else {
        await groupsApi.addMember(group!.id, newName, newType);
        await refresh();
      }
      setNewName("");
    } catch (e: any) {
      alert(`Couldn't add member: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (isGuest()) { removeGroupMember(group!.id, memberId); return; }
    try {
      await groupsApi.removeMember(memberId);
      await refresh();
    } catch (e: any) {
      alert(`Couldn't remove member: ${e?.message ?? "unknown error"}`);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group!.name}"? This can't be undone.`)) return;
    if (isGuest()) { deleteGroup(group!.id); navigate("/groups"); return; }
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
      if (isGuest()) {
        setShowModal(false);
        launchSession(undefined, num_courts, venue, scheduled_at);
        return;
      }
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
              <p className="text-gray-400 text-sm font-display text-center py-6">No members yet.</p>
            )}
          </div>

          {/* Add member (owner only) */}
          {isOwner && (
            <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="Add a member…"
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 font-display font-bold text-gray-900 text-sm focus:outline-none focus:border-purple-400 transition-colors" />
                <button onClick={handleAdd} disabled={!newName.trim()}
                  className="px-3 rounded-xl bg-purple-600 text-white disabled:opacity-40 active:scale-95 transition-all">
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex gap-1.5">
                {(["male", "female", "guest"] as MemberType[]).map((t) => (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`flex-1 h-8 rounded-lg font-display font-bold text-xs capitalize transition-all border-2 flex items-center justify-center gap-1.5
                      ${newType === t ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500"}`}>
                    <span className={`w-2 h-2 rounded-full ${TYPE_DOT[t]}`} /> {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── INVITE LINK (owner) ── */}
        {isOwner && (
          <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Link2 size={15} className="text-white/70 flex-shrink-0" />
            <span className="flex-1 text-white/60 text-xs font-mono truncate">{inviteLink}</span>
            <button onClick={copyInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-purple-600 font-display font-bold text-xs active:scale-95 transition-all flex-shrink-0">
              {copied ? <><Check size={12} />Copied</> : <>Copy</>}
            </button>
          </div>
        )}

        {/* ── CREATE ACCOUNT NUDGE ── */}
        {authLoaded && !currentUserId && !isOwner && (
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 flex items-start gap-3">
            <UserPlus size={18} className="text-white/70 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-display font-black text-white text-sm">Track your games</p>
              <p className="text-white/50 text-xs font-display mt-0.5">Create a free account to RSVP and see match history.</p>
              <button onClick={() => { localStorage.removeItem("friends-guest"); window.location.href = "/"; }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-purple-700 font-display font-black text-xs active:scale-95 transition-all">
                <UserPlus size={12} /> Create account
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom button — owner only */}
      {isOwner && (
        <div className="fixed bottom-0 left-0 right-0 p-4 max-w-xl mx-auto">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowModal(true)}
            disabled={group.members.length < 4}
            className="w-full py-4 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 shadow-2xl shadow-purple-500/30 flex items-center justify-center gap-2">
            <CalendarPlus size={20} />
            {group.members.length < 4 ? "Add at least 4 members first" : "Schedule / Start Session"}
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
