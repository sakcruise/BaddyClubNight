import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useSessionStore, useQueueStore, useMatchStore, useMemberStore, useAuthStore } from "../store";
import { authApi } from "../services/api";
import CheckInPanel from "../components/admin/CheckInPanel";
import CheckInGrid from "../components/admin/CheckInGrid";
import CourtsView from "../components/courts/CourtsView";
import Leaderboard from "../components/leaderboard/Leaderboard";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import MemberManagement from "../components/admin/MemberManagement";
import ClubSettings from "../components/admin/ClubSettings";
import HomeView from "./HomeView";
import { sessionsApi, queueApi, matchesApi, membersApi } from "../services/api";
import { X, Users, Cog, LogOut, History } from "lucide-react";

type Drawer = "members" | "settings" | null;

export default function MainView() {
  const navigate = useNavigate();
  const { adminName } = useAuthStore();
  const logout = () => authApi.logout();
  const { session, endSession, clubConfig: rawClubConfig, setCourts, setSession } = useSessionStore();
  const clubConfig = rawClubConfig ?? { name: "", venue: "", nightDay: "", nightStart: "", nightEnd: "", whatsapp: "" };
  const { setQueue, queue, activeMemberIds } = useQueueStore();
  const { setMatches } = useMatchStore();
  const { setMembers, members } = useMemberStore();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [ending, setEnding] = useState(false);
  const [courtsPct, setCourtsPct] = useState(55); // % of centre column height for courts
  const centreRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const startPct = courtsPct;
    const containerH = centreRef.current?.getBoundingClientRect().height ?? 600;

    function onMove(ev: MouseEvent | TouchEvent) {
      const y = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      const deltaPct = ((y - startY) / containerH) * 100;
      setCourtsPct(Math.min(80, Math.max(20, startPct + deltaPct)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [courtsPct]);

  // Bootstrap data on mount
  useEffect(() => {
    if (!session) return;
    async function load() {
      const [membersRes, sessionRes] = await Promise.all([
        membersApi.list(),
        sessionsApi.current(),
      ]);
      setMembers(membersRes.members);
      if (!sessionRes.session) return;
      setSession(sessionRes.session);

      const [queueRes, matchesRes] = await Promise.all([
        queueApi.get(sessionRes.session.id),
        matchesApi.list(sessionRes.session.id),
      ]);
      setQueue(queueRes.queue);
      setMatches(matchesRes.matches);

      // Reconcile court statuses from actual pending matches
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
  }, [session?.id]);

  // No active session → show home screen
  if (!session) return <HomeView />;

  const onCourtCount = activeMemberIds.size;
  const queuedIds = new Set(queue.map((q) => q.member_id));
  const allCheckedInIds = new Set([...queuedIds, ...activeMemberIds]);
  const checkedInMembers = Object.values(members).filter(
    (m) => m.member_type !== "guest" && allCheckedInIds.has(m.id)
  ).length;
  const checkedInGuests = Object.values(members).filter(
    (m) => m.member_type === "guest" && allCheckedInIds.has(m.id)
  ).length;
  const notYetCount = Object.values(members).filter(
    (m) => m.member_type !== "guest" && !queuedIds.has(m.id) && !activeMemberIds.has(m.id)
  ).length;

  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  async function handleEndNight() {
    if (!session || !confirm("End tonight's session? This cannot be undone.")) return;
    setEnding(true);
    try {
      await sessionsApi.end(session.id);
      endSession();
    } finally {
      setEnding(false);
    }
  }

  return (
    <div
      className="h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #fff7ed 0%, #ffedd5 50%, #fef3c7 100%)" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-0 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c2d12 0%, #c2410c 40%, #ea580c 70%, #f59e0b 100%)",
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

        {/* Centre: Check-in stats — absolutely centred in the header */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          {/* Checked In tile — shows e.g. "11m +2g" */}
          <div className="bg-green-500/20 border border-green-400/30 backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[88px]">
            <div className="text-white font-display font-black text-xl leading-none">
                {checkedInMembers}
              {checkedInGuests > 0 && (
                <span className="text-purple-300 text-base"> +{checkedInGuests}</span>
              )}
            </div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Checked In</div>
          </div>
          {/* Not Yet */}
          <div className="bg-white/15 border border-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[72px]">
            <div className="text-white font-display font-black text-xl leading-none">{notYetCount}</div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Not Yet</div>
          </div>
          {/* Total */}
          <div className="bg-orange-500/20 border border-orange-400/30 backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[88px]">
            <div className="text-white font-display font-black text-xl leading-none">
              {Object.values(members).filter((m) => m.member_type !== "guest").length}
              {checkedInGuests > 0 && (
                <span className="text-purple-300 text-base"> +{checkedInGuests}</span>
              )}
            </div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Total</div>
          </div>
        </div>

        {/* Right: Controls */}
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
          <button
            onClick={handleEndNight}
            disabled={ending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/80 border border-red-400/40
                       text-white text-xs font-display font-bold hover:bg-red-600/90 active:scale-95 transition-all"
          >
            <LogOut size={14} />
            {ending ? "Ending…" : "End Night"}
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/20
                       text-white/70 text-xs font-display font-bold hover:bg-white/20 active:scale-95 transition-all"
            title={adminName ?? ""}
          >
            <LogOut size={14} />
            {adminName ?? "Sign Out"}
          </button>
        </div>
      </header>

      {/* ── 3-Column Layout ─────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-[0.8fr_2fr_1fr] gap-3 p-3 overflow-hidden min-h-0">

        {/* Col 1 — Queue */}
        <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0">
          <div className="section-header flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 text-sm font-black">#</span>
            </div>
            <span className="section-title text-sm">Queue</span>
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CheckInPanel />
          </div>
        </div>

        {/* Col 2 — Courts (top) + Check-ins (bottom), resizable */}
        <div ref={centreRef} className="flex flex-col min-h-0 overflow-hidden gap-0">

          {/* Courts */}
          <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0"
               style={{ height: `${courtsPct}%` }}>
            <CourtsView />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={startResize}
            onTouchStart={startResize}
            className="flex-shrink-0 h-4 flex items-center justify-center cursor-row-resize group select-none"
          >
            <div className="w-12 h-1.5 rounded-full bg-gray-300 group-hover:bg-orange-400 group-active:bg-orange-500 transition-colors" />
          </div>

          {/* Check-ins grid */}
          <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0"
               style={{ height: `${100 - courtsPct}%` }}>
            <div className="section-header flex-shrink-0 mb-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sky-600 text-sm font-black">✓</span>
              </div>
              <span className="section-title text-sm">Check-ins</span>
              <span className="ml-auto text-[10px] font-display font-bold text-gray-400">
                tap name to check in · 🔵 male 🩷 female 🟣 guest
              </span>
            </div>
            <div className="overflow-y-auto min-h-0 flex-1">
              <CheckInGrid />
            </div>
          </div>

        </div>

        {/* Col 3 — Leaderboard */}
        <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0">
          <Leaderboard />
        </div>

      </main>

      {/* ── Slide-over Drawer ───────────────────────────────────────────── */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-brand-50 z-50 shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
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
