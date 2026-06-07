import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useSessionStore, useQueueStore, useMatchStore, useMemberStore } from "../store";
import CheckInPanel from "../components/admin/CheckInPanel";
import CourtsView from "../components/courts/CourtsView";
import Leaderboard from "../components/leaderboard/Leaderboard";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import MemberManagement from "../components/admin/MemberManagement";
import ClubSettings from "../components/admin/ClubSettings";
import { sessionsApi, queueApi, matchesApi, membersApi, syncApi } from "../services/api";
import { X, Users, Cog, LogOut, History } from "lucide-react";
import OfflineMode from "../components/shared/OfflineMode";

type Drawer = "members" | "settings" | null;

export default function AdminSessionView() {
  const navigate = useNavigate();
  const { session, endSession, clubConfig: rawClubConfig, courts, setCourts, setSession } = useSessionStore();
  const clubConfig = rawClubConfig ?? { name: "", venue: "", nightDay: "", nightStart: "", nightEnd: "", whatsapp: "" };
  const { setQueue, queue } = useQueueStore();
  const { setMatches, matches } = useMatchStore();
  const { setMembers } = useMemberStore();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [ending, setEnding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Bootstrap data on mount
  useEffect(() => {
    async function load() {
      const [membersRes, sessionRes] = await Promise.all([
        membersApi.list(),
        sessionsApi.current(),
      ]);
      setMembers(membersRes.members);
      if (!sessionRes.session) {
        // No active session on local server — clear stale cached state
        endSession();
        return;
      }
      setSession(sessionRes.session);
      if (courts.length === 0) {
        setCourts(
          Array.from({ length: sessionRes.session.num_courts }, (_, i) => ({
            id: i + 1,
            status: "idle" as const,
          }))
        );
      }
      const [queueRes, matchesRes] = await Promise.all([
        queueApi.get(sessionRes.session.id),
        matchesApi.list(sessionRes.session.id),
      ]);
      setQueue(queueRes.queue);
      setMatches(matchesRes.matches);

      // Reconcile court statuses against actual pending matches
      const pendingByCourt = Object.fromEntries(
        matchesRes.matches
          .filter((m) => m.result === "pending")
          .map((m) => [m.court_id, m.id])
      );
      const numCourts = sessionRes.session.num_courts;
      setCourts(
        Array.from({ length: numCourts }, (_, i) => {
          const id = i + 1;
          return pendingByCourt[id]
            ? { id, status: "playing" as const, current_match_id: pendingByCourt[id] }
            : { id, status: "idle" as const };
        })
      );

      // Reconcile activeMemberIds from pending matches
      const activePlayers = new Set(
        matchesRes.matches
          .filter((m) => m.result === "pending")
          .flatMap((m) => [...m.team_a, ...m.team_b])
      );
      useQueueStore.getState().setActiveMemberIds(activePlayers);
    }
    load();
  }, []);

  if (!session) return null;

  const activeMatches = matches.filter((m) => m.result === "pending").length;
  const finished = matches.filter((m) => m.result === "complete").length;
  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  async function handleEndNight() {
    if (!session || !confirm("End tonight's session? This cannot be undone.")) return;
    setEnding(true);
    const sessionId = session.id;
    try {
      await sessionsApi.end(sessionId);
      // Attempt cloud sync — best effort, don't block End Night
      setSyncStatus("syncing");
      syncApi.push(sessionId)
        .then(({ synced_at }) => { setSyncedAt(synced_at); setSyncStatus("done"); })
        .catch(() => setSyncStatus("error"))
        .finally(() => endSession());
    } finally {
      setEnding(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-50)) 0%, rgb(var(--p-100)) 50%, rgb(var(--p-100)) 100%)" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-0 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 70%, rgb(var(--p-500)) 100%)",
          minHeight: "80px",
        }}
      >
        {/* Left: Logo + club */}
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={36} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-xl leading-tight">
              {clubConfig.name || session.club_name}
            </h1>
            <p className="text-orange-200 text-xs font-display font-semibold">{dateStr}</p>
          </div>
        </div>

        {/* Centre: Stats */}
        <div className="flex items-center gap-2">
          {[
            { label: "In Queue",  value: queue.length,                                    color: "bg-white/15" },
            { label: "On Court",  value: activeMatches * 4,                               color: "bg-green-500/20 border border-green-400/30" },
            { label: "Total",     value: queue.length + activeMatches * 4,                color: "bg-white/10" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`${color} backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[72px]`}>
              <div className="text-white font-display font-black text-xl leading-none">{value}</div>
              <div className="text-orange-200 text-xs font-display font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Right: Admin controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/history")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-bold transition-all
              bg-white/15 text-white hover:bg-white/25 border border-white/20"
          >
            <History size={14} />
            History
          </button>
          <button
            onClick={() => setDrawer(drawer === "members" ? null : "members")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-bold transition-all
              ${drawer === "members"
                ? "bg-white text-orange-600"
                : "bg-white/15 text-white hover:bg-white/25 border border-white/20"
              }`}
          >
            <Users size={14} />
            Members
          </button>
          <button
            onClick={() => setDrawer(drawer === "settings" ? null : "settings")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-bold transition-all
              ${drawer === "settings"
                ? "bg-white text-orange-600"
                : "bg-white/15 text-white hover:bg-white/25 border border-white/20"
              }`}
          >
            <Cog size={14} />
            Settings
          </button>
          <OfflineMode />
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleEndNight}
              disabled={ending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/80 border border-red-400/40
                         text-white text-xs font-display font-bold hover:bg-red-600/90 active:scale-95 transition-all"
            >
              <LogOut size={14} />
              {ending ? "Ending…" : "End Night"}
            </button>
            {syncStatus === "syncing" && (
              <span className="text-[10px] text-orange-200 font-display font-bold animate-pulse">☁ Syncing to cloud…</span>
            )}
            {syncStatus === "done" && syncedAt && (
              <span className="text-[10px] text-green-300 font-display font-bold">✓ Synced to cloud</span>
            )}
            {syncStatus === "error" && (
              <span className="text-[10px] text-red-300 font-display font-bold">⚠ Sync failed — will retry</span>
            )}
          </div>
        </div>
      </header>

      {/* ── 3-Column Layout ─────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-[1fr_2.2fr_1fr] gap-4 p-4 overflow-hidden min-h-0">

        {/* Left — Check-ins */}
        <div className="glass-card overflow-hidden flex flex-col p-5 min-h-0">
          <h2 className="font-display font-black text-gray-800 text-base mb-4 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 text-xs">✓</span>
            Check-ins
          </h2>
          <div className="flex-1 overflow-y-auto min-h-0">
            <CheckInPanel />
          </div>
        </div>

        {/* Centre — Courts */}
        <div className="glass-card overflow-hidden flex flex-col p-5 min-h-0">
          <CourtsView />
        </div>

        {/* Right — Leaderboard */}
        <div className="glass-card overflow-hidden flex flex-col p-5 min-h-0">
          <Leaderboard />
        </div>

      </main>

      {/* ── Slide-over Drawer ───────────────────────────────────────────── */}
      <AnimatePresence>
        {drawer && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
            />
            {/* Panel */}
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-brand-50 z-50 shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100">
                <span className="font-display font-black text-gray-900 text-lg">
                  {drawer === "members" ? "Club Roster" : "Club Settings"}
                </span>
                <button
                  onClick={() => setDrawer(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Drawer content */}
              <div className="flex-1 overflow-y-auto p-4">
                {drawer === "members" && <MemberManagement />}
                {drawer === "settings" && <ClubSettings />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
