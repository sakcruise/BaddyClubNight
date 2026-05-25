import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, useAuthStore, useMemberStore } from "../store";
import { sessionsApi, membersApi, authApi } from "../services/api";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import MemberManagement from "../components/admin/MemberManagement";
import ClubSettings from "../components/admin/ClubSettings";
import { History, Users, Cog, LogOut, Play, X } from "lucide-react";

type Panel = "start" | "members" | "settings" | null;

export default function HomeView() {
  const navigate = useNavigate();
  const { adminName, clubName: authClubName } = useAuthStore();
  const logout = () => authApi.logout();
  const { setSession, setCourts, clubName, setClubName, clubConfig } = useSessionStore();
  const { setMembers } = useMemberStore();

  const [panel, setPanel] = useState<Panel>(null);
  const [numCourts, setNumCourts] = useState(4);
  const [starting, setStarting] = useState(false);

  const displayName = clubName || authClubName || "Club Night";

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  async function handleStart() {
    if (!clubName.trim()) return;
    setStarting(true);
    try {
      const [{ session }, membersRes] = await Promise.all([
        sessionsApi.start({ club_name: clubName.trim(), num_courts: numCourts }),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      setSession(session);
      setCourts(Array.from({ length: numCourts }, (_, i) => ({ id: i + 1, status: "idle" as const })));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #7c2d12 0%, #c2410c 35%, #ea580c 60%, #f59e0b 100%)" }}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #fbbf24, transparent)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #fb923c, transparent)" }} />

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
            What would you<br />like to do?
          </h2>
          <p className="text-orange-200 text-sm font-display font-semibold">
            Choose an option below to get started
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
                  {/* Club name */}
                  <div>
                    <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Club Name</label>
                    <input
                      type="text"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="e.g. Smash Club"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-display font-bold text-gray-900
                                 focus:outline-none focus:border-orange-400 transition-colors"
                    />
                  </div>

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

                  <button
                    onClick={handleStart}
                    disabled={!clubName.trim() || starting}
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

          {/* Secondary options */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: History, label: "History",  action: () => navigate("/history") },
              { icon: Users,   label: "Members",  action: () => setPanel(panel === "members" ? null : "members") },
              { icon: Cog,     label: "Settings", action: () => setPanel(panel === "settings" ? null : "settings") },
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

      {/* Slide-over for Members / Settings */}
      <AnimatePresence>
        {(panel === "members" || panel === "settings") && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPanel(null)} />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-display font-black text-gray-900 text-lg">
                  {panel === "members" ? "Club Roster" : "Club Settings"}
                </span>
                <button onClick={() => setPanel(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {panel === "members" && <MemberManagement />}
                {panel === "settings" && <ClubSettings />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
