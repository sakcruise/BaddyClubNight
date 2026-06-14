import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, ChevronRight, X, LogOut, Calendar, Clock, Zap, Play } from "lucide-react";
import { useGroupStore, useAuthStore, useSessionStore } from "../store";
import { authApi } from "../services/api";
import { groupsApi } from "../services/groups";
import { supabase } from "../lib/supabase";
import type { GroupSession } from "../types";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

function sessionLabel(s: GroupSession, isPast: boolean): { icon: React.ReactNode; text: string; color: string } {
  if (s.status === "active") return { icon: <Zap size={11} />, text: "Happening now!", color: "text-green-600 bg-green-50" };
  const d = new Date(s.scheduled_at ?? s.created_at);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : diffDays === -1 ? "Yesterday" :
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if (isPast) return { icon: <Clock size={11} />, text: `Last: ${dateStr}`, color: "text-gray-400 bg-gray-50" };
  return { icon: <Calendar size={11} />, text: `${dateStr} · ${time}`, color: "text-purple-600 bg-purple-50" };
}

/** Splitwise-style home: the list of friends-groups this person belongs to. */
export default function GroupsHomeView() {
  const navigate = useNavigate();
  const { groups, createGroup, setGroups, setAppMode } = useGroupStore();
  const displayName = useAuthStore((s) => s.displayName);
  const adminName = useAuthStore((s) => s.adminName);
  const activeSession = useSessionStore((s) => s.session);
  const isGuest = localStorage.getItem("friends-guest") === "true";
  const [loading, setLoading] = useState(!isGuest);

  // Account users: load groups from Supabase, then fetch featured session per group.
  useEffect(() => {
    if (isGuest) return;
    groupsApi.list()
      .then((gs) => {
        setGroups(gs);
        // Fetch sessions for each group in parallel
        gs.forEach(async (g) => {
          try {
            // Upcoming/active first
            const upcoming = await groupsApi.listSessions(g.id);
            if (upcoming.length > 0) {
              setFeaturedSessions((prev) => ({ ...prev, [g.id]: { session: upcoming[0], isPast: false } }));
              return;
            }
            // Fall back to most recent completed session
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
      })
      .catch((e) => console.error("Failed to load groups:", e))
      .finally(() => setLoading(false));
  }, [isGuest]);

  function signOut() {
    if (isGuest) {
      localStorage.removeItem("friends-guest");
      setAppMode(null);
      window.location.href = window.location.origin + "/";
      return;
    }
    authApi.logout();
  }

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [courts, setCourts] = useState(1);
  const [saving, setSaving] = useState(false);
  const [featuredSessions, setFeaturedSessions] = useState<Record<string, { session: GroupSession; isPast: boolean } | null>>({});

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      // Prefer adminName (personal name) over displayName which may be a club name
      const ownerName = adminName?.trim() || displayName?.trim() || "Me";
      if (isGuest) {
        const g = createGroup(name, { num_courts: courts });
        useGroupStore.getState().addGroupMember(g.id, ownerName);
        setName("");
        setCreating(false);
        navigate(`/groups/${g.id}`);
      } else {
        const created = await groupsApi.create(name, { num_courts: courts });
        // Add owner as first member only if none were created automatically
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
      }
    } catch (e: any) {
      alert(`Couldn't create group: ${e?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={28} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-lg leading-tight">My Groups</h1>
            <p className="text-orange-200 text-xs font-display">Play with friends</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/70 text-xs font-display font-bold hover:bg-white/20 transition-all"
          >
            <LogOut size={13} /> {isGuest ? "Exit" : "Sign Out"}
          </button>
        </div>
      </header>

      {/* Resume active session banner */}
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

      {/* Group list */}
      <main className="flex-1 overflow-y-auto px-5 pb-28 max-w-xl w-full mx-auto">
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
          <div className="flex flex-col gap-3 mt-2">
            {groups.map((g) => {
              const featured = featuredSessions[g.id];
              const label = featured ? sessionLabel(featured.session, featured.isPast) : null;
              return (
                <motion.button
                  key={g.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-lg shadow-black/10 text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/20">
                    <Users size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-black text-gray-900 text-base truncate">{g.name}</div>
                    <div className="text-gray-500 text-xs font-display mt-0.5">
                      {g.members.length} {g.members.length === 1 ? "member" : "members"} · {g.num_courts} court{g.num_courts > 1 ? "s" : ""}
                    </div>
                    {label && (
                      <div className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-display font-bold ${label.color}`}>
                        {label.icon} {label.text}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}
      </main>

      {/* Create FAB */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white shadow-2xl shadow-black/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={26} className="text-purple-600" />
      </button>

      {/* Create modal */}
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}
