import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, useAuthStore, useMemberStore } from "../store";
import { sessionsApi, membersApi, authApi } from "../services/api";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import { History, Users, Cog, LogOut, Play, BarChart2, Zap, Info, Trophy, Wallet } from "lucide-react";

type Panel = "start" | null;

export default function HomeView() {
  const navigate = useNavigate();
  const { adminName, displayName: authDisplayName } = useAuthStore();
  const logout = () => authApi.logout();
  const { setSession, setCourts, clubName, clubConfig, setClubConfig } = useSessionStore();
  const { setMembers } = useMemberStore();

  const [panel, setPanel] = useState<Panel>(null);
  const [numCourts, setNumCourts] = useState(4);
  const [starting, setStarting] = useState(false);
  const [startingTournament, setStartingTournament] = useState(false);
  const [infoTip, setInfoTip] = useState<"balanced" | "competitive" | null>(null);

  useEffect(() => {
    if (!infoTip) return;
    const close = () => setInfoTip(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [infoTip]);

  const displayName = clubName || authDisplayName || "Club Night";

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  async function handleStart() {
    if (!displayName.trim()) return;
    setStarting(true);
    try {
      const [{ session }, membersRes] = await Promise.all([
        sessionsApi.start({ club_name: displayName.trim(), num_courts: numCourts }),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      setSession(session);
      setCourts(Array.from({ length: numCourts }, (_, i) => ({ id: i + 1, status: "idle" as const })));
    } finally {
      setStarting(false);
    }
  }

  async function handleStartTournament() {
    if (!displayName.trim()) return;
    setStartingTournament(true);
    try {
      const [{ session }, membersRes] = await Promise.all([
        sessionsApi.start({ club_name: displayName.trim(), num_courts: numCourts }),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      setSession(session);
      setCourts(Array.from({ length: numCourts }, (_, i) => ({ id: i + 1, status: "idle" as const })));
      navigate(`/tournament-setup/${session.id}`);
    } finally {
      setStartingTournament(false);
    }
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 35%, rgb(var(--p-600)) 60%, rgb(var(--p-500)) 100%)" }}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #fbbf24, transparent)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgb(var(--p-400)), transparent)" }} />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-2xl p-2 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={32} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-lg leading-tight">{displayName}</h1>
            <p className="text-orange-200 text-xs font-display">{today}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-xs font-display font-bold hidden sm:block">
            👋 {adminName}
          </span>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/20
                       text-white/70 text-xs font-display font-bold hover:bg-white/20 transition-all"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 gap-6">

        {/* Hero */}
        <div className="text-center">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="inline-block mb-4"
          >
            <ShuttlecockIcon size={80} />
          </motion.div>
          <h2 className="text-white font-display font-black text-4xl leading-tight mb-1">
            Welcome, {displayName}! 👋
          </h2>
          <p className="text-orange-200 text-sm font-display font-semibold">
            Ready to start tonight's session?
          </p>
        </div>

        {/* Action cards */}
        <div className="w-full max-w-md flex flex-col gap-3">

          {/* Start Night — primary */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setPanel(panel === "start" ? null : "start")}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/30">
              <Play size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-gray-900 text-base">Start Club Night</div>
              <div className="text-gray-500 text-sm font-display">Open courts and let players check in</div>
            </div>
            <motion.div animate={{ rotate: panel === "start" ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <Play size={16} className="text-gray-300" />
            </motion.div>
          </motion.button>

          {/* Start night inline form */}
          <AnimatePresence>
            {panel === "start" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                  {/* Club name already shown top-left in the header — no need to repeat it here */}
                  {/* Courts */}
                  <div>
                    <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Courts Tonight</label>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => setNumCourts((n) => Math.max(1, n - 1))}
                        className="w-11 h-11 rounded-xl bg-orange-100 border-2 border-orange-200 font-display font-black text-xl text-orange-600
                                   hover:bg-orange-200 active:scale-95 transition-all">−</button>
                      <div className="flex-1 h-11 rounded-xl border-2 border-orange-300 text-center flex items-center justify-center
                                      font-display font-black text-2xl text-orange-600">{numCourts}</div>
                      <button onClick={() => setNumCourts((n) => Math.min(20, n + 1))}
                        className="w-11 h-11 rounded-xl bg-orange-100 border-2 border-orange-200 font-display font-black text-xl text-orange-600
                                   hover:bg-orange-200 active:scale-95 transition-all">+</button>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button key={n} onClick={() => setNumCourts(n)}
                          className={`flex-1 h-8 rounded-lg font-display font-bold text-sm transition-all border-2
                            ${numCourts === n ? "bg-orange-500 text-white border-orange-400" : "bg-orange-50 text-orange-500 border-orange-200 hover:border-orange-400"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Pick */}
                  <div className="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-violet-600">
                        <Zap size={15} />
                        <span className="font-display font-bold text-sm text-gray-800">Auto-Pick Players</span>
                      </div>
                      <button
                        onClick={() => setClubConfig({ autoPickEnabled: !clubConfig.autoPickEnabled })}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0
                          ${clubConfig.autoPickEnabled ? "bg-violet-500" : "bg-gray-200"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                          ${clubConfig.autoPickEnabled ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {clubConfig.autoPickEnabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <div
                          onClick={() => setClubConfig({ autoPickMode: "balanced" })}
                          className={`relative py-2 px-3 rounded-xl border-2 text-left transition-all cursor-pointer
                            ${clubConfig.autoPickMode === "balanced" || !clubConfig.autoPickMode
                              ? "border-violet-400 bg-violet-50"
                              : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-display font-bold text-xs text-gray-900">⚖️ Balanced</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setInfoTip(infoTip === "balanced" ? null : "balanced"); }}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              <Info size={12} />
                            </button>
                          </div>
                          {infoTip === "balanced" && (
                            <div className="absolute z-10 top-full left-0 mt-1 w-44 bg-gray-900 text-white text-[10px] font-body leading-snug rounded-lg px-2.5 py-2 shadow-lg">
                              Mixes strong &amp; weak players - great for social play
                            </div>
                          )}
                        </div>
                        <div
                          onClick={() => setClubConfig({ autoPickMode: "competitive" })}
                          className={`relative py-2 px-3 rounded-xl border-2 text-left transition-all cursor-pointer
                            ${clubConfig.autoPickMode === "competitive"
                              ? "border-violet-400 bg-violet-50"
                              : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-display font-bold text-xs text-gray-900">🏆 Competitive</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setInfoTip(infoTip === "competitive" ? null : "competitive"); }}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              <Info size={12} />
                            </button>
                          </div>
                          {infoTip === "competitive" && (
                            <div className="absolute z-10 top-full right-0 mt-1 w-44 bg-gray-900 text-white text-[10px] font-body leading-snug rounded-lg px-2.5 py-2 shadow-lg">
                              Groups similar levels - tighter, more even matches
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleStart}
                    disabled={!displayName.trim() || starting}
                    className="w-full py-3 rounded-xl font-display font-black text-white text-base
                               bg-gradient-to-r from-orange-600 to-orange-500
                               hover:from-orange-700 hover:to-orange-600
                               disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
                  >
                    {starting ? "Starting…" : "🏸 Start Night!"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Start a Tournament — primary */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStartTournament}
            disabled={!displayName.trim() || startingTournament}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/30">
              <Trophy size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-gray-900 text-base">
                {startingTournament ? "Starting…" : "Start a Tournament"}
              </div>
              <div className="text-gray-500 text-sm font-display">Level-balanced groups, round-robin &amp; knockout</div>
            </div>
          </motion.button>

          {/* Secondary options */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: History,   label: "History",   action: () => navigate("/history") },
              { icon: BarChart2, label: "Analytics", action: () => navigate("/analytics") },
              { icon: Users,     label: "Members",   action: () => navigate("/members") },
              { icon: Wallet,    label: "Finance",   action: () => navigate("/finance") },
              { icon: Cog,       label: "Settings",  action: () => navigate("/settings") },
            ].map(({ icon: Icon, label, action }) => (
              <motion.button
                key={label}
                whileTap={{ scale: 0.95 }}
                onClick={action}
                className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl p-4
                           flex flex-col items-center gap-2 hover:bg-white/25 transition-all"
              >
                <Icon size={20} className="text-white" />
                <span className="text-white text-xs font-display font-bold">{label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
