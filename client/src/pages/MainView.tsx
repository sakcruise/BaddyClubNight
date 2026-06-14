import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Navigate } from "react-router-dom";
import { useSessionStore, useQueueStore, useMatchStore, useMemberStore, useAuthStore, useSessionArchiveStore, useGroupStore } from "../store";
import { authApi } from "../services/api";
import CheckInPanel from "../components/admin/CheckInPanel";
import CheckInGrid from "../components/admin/CheckInGrid";
import CourtsView from "../components/courts/CourtsView";
import Leaderboard from "../components/leaderboard/Leaderboard";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import OnboardingTour from "../components/shared/OnboardingTour";
import EndNightCheers from "../components/shared/EndNightCheers";
import MemberManagement from "../components/admin/MemberManagement";
import ClubSettings from "../components/admin/ClubSettings";
import HomeView from "./HomeView";
import { sessionsApi, queueApi, matchesApi, membersApi } from "../services/api";
import { X, Users, Cog, LogOut, History, LayoutGrid, ListOrdered, Trophy, Menu, Maximize2, Minimize2 } from "lucide-react";

type Drawer = "members" | "settings" | "menu" | null;
type MobileTab = "queue" | "courts" | "checkins" | "leaderboard";

export default function MainView() {
  const navigate = useNavigate();
  const { adminName } = useAuthStore();
  const appMode = useGroupStore((s) => s.appMode);
  const logout = () => authApi.logout();
  const { session, endSession, clubConfig: rawClubConfig, setCourts, setSession } = useSessionStore();
  const clubConfig = rawClubConfig ?? { name: "", venue: "", nightDay: "", nightStart: "", nightEnd: "", whatsapp: "" };
  const { setQueue, queue, activeMemberIds } = useQueueStore();
  const { setMatches, matches } = useMatchStore();
  const { archiveSession } = useSessionArchiveStore();
  const { setMembers, members } = useMemberStore();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [ending, setEnding] = useState(false);
  const [showCheers, setShowCheers] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
  const [mobileTab, setMobileTab] = useState<MobileTab>("courts");
  const [courtsPct, setCourtsPct] = useState(55);
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

  useEffect(() => {
    if (!session) return;

    // In offline mode OR for group sessions (which run entirely on local Zustand),
    // trust the persisted stores — skip all Supabase calls.
    // Courts may not be in store after a hard refresh, so rebuild them from persisted matches.
    const offline = localStorage.getItem("offline-mode") === "true" || !navigator.onLine || !!session.group_id;
    if (offline) {
      const pendingByCourt = Object.fromEntries(
        matches.filter((m) => m.result === "pending").map((m) => [m.court_id, m.id])
      );
      setCourts(Array.from({ length: session.num_courts }, (_, i) => {
        const id = i + 1;
        return pendingByCourt[id]
          ? { id, status: "playing" as const, current_match_id: pendingByCourt[id] }
          : { id, status: "idle" as const };
      }));
      const activePlayers = new Set<string>(
        matches.filter((m) => m.result === "pending").flatMap((m) => [...m.team_a, ...m.team_b])
      );
      useQueueStore.getState().setActiveMemberIds(activePlayers);
      return;
    }

    async function load() {
      try {
        const [membersRes, sessionRes] = await Promise.all([
          membersApi.list(),
          sessionsApi.current(),
        ]);
        setMembers(membersRes.members);

        if (!sessionRes.session) {
          // Session ended elsewhere (e.g. another device) — clear stale local state
          endSession();
          setMatches([]);
          setQueue([]);
          useQueueStore.getState().setActiveMemberIds(new Set());
          return;
        }

        setSession(sessionRes.session);
        const [queueRes, matchesRes] = await Promise.all([
          queueApi.get(sessionRes.session.id),
          matchesApi.list(sessionRes.session.id),
        ]);
        setQueue(queueRes.queue);
        setMatches(matchesRes.matches);
        const pendingByCourt = Object.fromEntries(
          matchesRes.matches.filter((m) => m.result === "pending").map((m) => [m.court_id, m.id])
        );
        const numCourts = sessionRes.session.num_courts;
        setCourts(Array.from({ length: numCourts }, (_, i) => {
          const id = i + 1;
          return pendingByCourt[id]
            ? { id, status: "playing" as const, current_match_id: pendingByCourt[id] }
            : { id, status: "idle" as const };
        }));
        const activePlayers = new Set(
          matchesRes.matches.filter((m) => m.result === "pending").flatMap((m) => [...m.team_a, ...m.team_b])
        );
        useQueueStore.getState().setActiveMemberIds(activePlayers);
      } catch (err) {
        console.error("Failed to restore session state:", err);
        // Don't clear state on transient errors (network blip etc.)
      }
    }
    load();
  }, [session?.id]);

  if (!session) return appMode === "friends" ? <Navigate to="/groups" replace /> : <HomeView />;

  const queuedIds = new Set(queue.map((q) => q.member_id));
  const allCheckedInIds = new Set([...queuedIds, ...activeMemberIds]);
  const checkedInMembers = Object.values(members).filter((m) => m.member_type !== "guest" && allCheckedInIds.has(m.id)).length;
  const checkedInGuests = Object.values(members).filter((m) => m.member_type === "guest" && allCheckedInIds.has(m.id)).length;
  const notYetCount = Object.values(members).filter((m) => m.member_type !== "guest" && !queuedIds.has(m.id) && !activeMemberIds.has(m.id)).length;
  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  function handleEndNight() {
    if (!session) return;
    setShowCheers(true);
  }

  async function confirmEndNight() {
    if (!session) return;
    setEnding(true);
    try {
      // Archive locally BEFORE clearing state.
      // Offline: this is the only copy. Online: belt-and-braces so History works immediately.
      archiveSession({ ...session, status: "ended" }, matches);

      await sessionsApi.end(session.id);
      setShowCheers(false);
      endSession();                                                // session + courts → empty
      setMatches([]);                                             // clear persisted match history
      setQueue([]);                                               // clear queue
      useQueueStore.getState().setActiveMemberIds(new Set());     // clear on-court players
    } catch (err: any) {
      console.error("End night failed:", err);
      setShowCheers(false);
      alert(`Could not end the session: ${err?.message ?? "unknown error"}. Please try again.`);
    } finally {
      setEnding(false);
    }
  }

  const mobileTabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    { id: "queue",       label: "Queue",    icon: <ListOrdered size={18} /> },
    { id: "courts",      label: "Courts",   icon: <LayoutGrid size={18} /> },
    { id: "checkins",    label: "Check-in", icon: <Users size={18} /> },
    { id: "leaderboard", label: "Scores",   icon: <Trophy size={18} /> },
  ];

  return (
    <div className="h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-50)) 0%, rgb(var(--p-100)) 50%, rgb(var(--p-100)) 100%)" }}>

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-3 md:px-6 flex-shrink-0 relative"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 70%, rgb(var(--p-500)) 100%)",
          minHeight: "60px",
        }}>

        {/* Left: Logo + club */}
        <div className="flex items-center gap-2">
          <div className="bg-white/15 rounded-xl p-1.5 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={24} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-sm leading-tight">
              {session.group_id ? session.club_name : (clubConfig.name || session.club_name)}
            </h1>
            <p className="text-orange-200 text-[10px] font-display">{dateStr}</p>
          </div>
        </div>

        {/* Centre stats — hidden on very small screens */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-1.5">
          <div className="bg-green-500/20 border border-green-400/30 backdrop-blur-sm rounded-xl px-3 py-1.5 text-center">
            <div className="text-white font-display font-black text-base leading-none">
              {checkedInMembers}{checkedInGuests > 0 && <span className="text-purple-300 text-sm"> +{checkedInGuests}</span>}
            </div>
            <div className="text-orange-200 text-[9px] font-display font-bold">Checked In</div>
          </div>
          <div className="bg-white/15 border border-white/10 backdrop-blur-sm rounded-xl px-3 py-1.5 text-center">
            <div className="text-white font-display font-black text-base leading-none">{notYetCount}</div>
            <div className="text-orange-200 text-[9px] font-display font-bold">Not Yet</div>
          </div>
          <div className="bg-orange-500/20 border border-orange-400/30 backdrop-blur-sm rounded-xl px-3 py-1.5 text-center">
            <div className="text-white font-display font-black text-base leading-none">
              {Object.values(members).filter((m) => m.member_type !== "guest").length}
              {checkedInGuests > 0 && <span className="text-purple-300 text-sm"> +{checkedInGuests}</span>}
            </div>
            <div className="text-orange-200 text-[9px] font-display font-bold">Total</div>
          </div>
        </div>

        {/* Right: desktop buttons / mobile hamburger */}
        <div className="flex items-center gap-1.5">
          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-1.5">
            <button onClick={() => navigate("/history")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-display font-bold
                bg-white/15 text-white hover:bg-white/25 border border-white/20 transition-all">
              <History size={13} /> History
            </button>
            {!session.group_id && (
              <>
                <button onClick={() => setDrawer(drawer === "members" ? null : "members")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-display font-bold transition-all
                    ${drawer === "members" ? "bg-white text-orange-600" : "bg-white/15 text-white hover:bg-white/25 border border-white/20"}`}>
                  <Users size={13} /> Members
                </button>
                <button onClick={() => setDrawer(drawer === "settings" ? null : "settings")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-display font-bold transition-all
                    ${drawer === "settings" ? "bg-white text-orange-600" : "bg-white/15 text-white hover:bg-white/25 border border-white/20"}`}>
                  <Cog size={13} /> Settings
                </button>
              </>
            )}
            <button onClick={toggleFullscreen}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/15 border border-white/20
                text-white text-xs font-display font-bold hover:bg-white/25 active:scale-95 transition-all"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={handleEndNight} disabled={ending}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/80 border border-red-400/40
                text-white text-xs font-display font-bold hover:bg-red-600/90 active:scale-95 transition-all">
              <LogOut size={13} /> {ending ? "Ending…" : session.group_id ? "End Session" : "End Night"}
            </button>
            <button onClick={() => logout()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/20
                text-white/70 text-xs font-display font-bold hover:bg-white/20 transition-all">
              <LogOut size={13} /> {adminName ?? "Out"}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setDrawer("menu")}
            className="md:hidden p-2 rounded-xl bg-white/15 border border-white/20 text-white">
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Mobile stats bar */}
      <div className="sm:hidden flex gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-700)), rgb(var(--p-600)))" }}>
        <div className="flex-1 text-center">
          <div className="text-white font-display font-black text-base leading-none">
            {checkedInMembers}{checkedInGuests > 0 && <span className="text-purple-300"> +{checkedInGuests}</span>}
          </div>
          <div className="text-orange-200 text-[9px] font-display font-bold">Checked In</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-white font-display font-black text-base leading-none">{notYetCount}</div>
          <div className="text-orange-200 text-[9px] font-display font-bold">Not Yet</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-white font-display font-black text-base leading-none">
            {Object.values(members).filter((m) => m.member_type !== "guest").length}
          </div>
          <div className="text-orange-200 text-[9px] font-display font-bold">Total</div>
        </div>
      </div>

      {/* ── Desktop: 3-Column Layout ── */}
      <main className="flex-1 min-h-0 overflow-hidden">

        {/* Desktop layout */}
        <div className="hidden md:grid md:grid-cols-[0.8fr_2fr_1fr] gap-3 p-3 h-full overflow-hidden">
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

          <div ref={centreRef} className="flex flex-col min-h-0 overflow-hidden gap-0">
            <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0" style={{ height: `${courtsPct}%` }}>
              <CourtsView />
            </div>
            <div onMouseDown={startResize} onTouchStart={startResize}
              className="flex-shrink-0 h-4 flex items-center justify-center cursor-row-resize group select-none">
              <div className="w-12 h-1.5 rounded-full bg-gray-300 group-hover:bg-orange-400 transition-colors" />
            </div>
            <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0" style={{ height: `${100 - courtsPct}%` }}>
              <div className="section-header flex-shrink-0 mb-2">
                <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sky-600 text-sm font-black">✓</span>
                </div>
                <span className="section-title text-sm">Check-ins</span>
                <span className="ml-auto text-[10px] font-display font-bold text-gray-400">
                  tap to check in · 🔵 male 🩷 female 🟣 guest
                </span>
              </div>
              <div className="overflow-y-auto min-h-0 flex-1"><CheckInGrid /></div>
            </div>
          </div>

          <div className="glass-card overflow-hidden flex flex-col p-4 min-h-0">
            <Leaderboard />
          </div>
        </div>

        {/* Mobile: single panel based on tab */}
        <div className="md:hidden h-full overflow-hidden p-3 pb-0">
          <div className="glass-card h-full overflow-hidden flex flex-col p-4 min-h-0">
            {mobileTab === "queue" && (
              <>
                <div className="section-header flex-shrink-0 mb-2">
                  <span className="text-orange-600 text-sm font-black">#</span>
                  <span className="section-title text-sm ml-2">Queue</span>
                </div>
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden"><CheckInPanel /></div>
              </>
            )}
            {mobileTab === "courts" && <CourtsView />}
            {mobileTab === "checkins" && (
              <>
                <div className="section-header flex-shrink-0 mb-2">
                  <span className="text-sky-600 text-sm font-black">✓</span>
                  <span className="section-title text-sm ml-2">Check-ins</span>
                </div>
                <div className="overflow-y-auto min-h-0 flex-1"><CheckInGrid /></div>
              </>
            )}
            {mobileTab === "leaderboard" && <Leaderboard />}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden flex-shrink-0 flex border-t border-gray-200 bg-white safe-area-pb">
        {mobileTabs.map((tab) => (
          <button key={tab.id} onClick={() => setMobileTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors
              ${mobileTab === tab.id ? "text-orange-600" : "text-gray-400"}`}>
            {tab.icon}
            <span className="text-[10px] font-display font-bold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Onboarding Tour (club only — its copy is club-specific) ── */}
      {!session.group_id && <OnboardingTour onTabChange={(tab) => setMobileTab(tab as MobileTab)} />}

      {/* ── End Night Cheers ── */}
      {showCheers && (
        <EndNightCheers
          matches={matches}
          members={members}
          onConfirm={confirmEndNight}
          onCancel={() => setShowCheers(false)}
          ending={ending}
          isGroup={!!session.group_id}
        />
      )}

      {/* ── Drawers ── */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)} />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}>

              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-display font-black text-gray-900 text-lg">
                  {drawer === "members" ? (session.group_id ? "Members" : "Club Roster") : drawer === "settings" ? (session.group_id ? "Settings" : "Club Settings") : "Menu"}
                </span>
                <button onClick={() => setDrawer(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {drawer === "menu" && (
                <div className="flex flex-col p-4 gap-2">
                  <button onClick={toggleFullscreen}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 font-display font-bold text-sm">
                    {isFullscreen ? <Minimize2 size={18} className="text-orange-500" /> : <Maximize2 size={18} className="text-orange-500" />}
                    {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  </button>
                  <button onClick={() => { navigate("/history"); setDrawer(null); }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 font-display font-bold text-sm">
                    <History size={18} className="text-orange-500" /> Session History
                  </button>
                  {!session.group_id && (
                    <>
                      <button onClick={() => setDrawer("members")}
                        className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 font-display font-bold text-sm">
                        <Users size={18} className="text-orange-500" /> Club Roster
                      </button>
                      <button onClick={() => setDrawer("settings")}
                        className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 font-display font-bold text-sm">
                        <Cog size={18} className="text-orange-500" /> Settings
                      </button>
                    </>
                  )}
                  <button onClick={handleEndNight} disabled={ending}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 font-display font-bold text-sm">
                    <LogOut size={18} /> {ending ? "Ending…" : session.group_id ? "End Session" : "End Night"}
                  </button>
                  <button onClick={() => logout()}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-500 font-display font-bold text-sm">
                    <LogOut size={18} /> Sign Out{adminName ? ` (${adminName})` : ""}
                  </button>
                </div>
              )}

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
