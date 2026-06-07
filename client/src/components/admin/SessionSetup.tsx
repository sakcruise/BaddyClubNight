import { useState } from "react";
import { motion } from "framer-motion";
import { sessionsApi } from "../../services/api";
import { useSessionStore } from "../../store";
import Button from "../shared/Button";
import ShuttlecockIcon from "../shared/ShuttlecockIcon";

export default function SessionSetup() {
  const { setSession, setCourts, clubName, setClubName, clubConfig } = useSessionStore();
  const [numCourts, setNumCourts] = useState(4);
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (!clubName.trim()) return;
    setStarting(true);
    try {
      const { session } = await sessionsApi.start({ club_name: clubName.trim(), num_courts: numCourts });
      setSession(session);
      setCourts(
        Array.from({ length: numCourts }, (_, i) => ({
          id: i + 1,
          status: "idle" as const,
        }))
      );
    } finally {
      setStarting(false);
    }
  }

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 35%, rgb(var(--p-600)) 60%, rgb(var(--p-500)) 100%)",
      }}
    >
      {/* Background decoration */}
      <div className="header-pattern absolute inset-0 pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, #fbbf24, transparent)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, rgb(var(--p-400)), transparent)" }} />

      <motion.div
        className="relative z-10 w-full max-w-lg mx-4"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Hero */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="inline-block mb-4"
          >
            <ShuttlecockIcon size={88} />
          </motion.div>
          <h1 className="gradient-text text-5xl font-display font-black leading-tight mb-2">
            Club Night
          </h1>
          <p className="text-orange-200 text-base font-display font-semibold">{today}</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 flex flex-col gap-6">

          {/* Club name */}
          <div className="flex flex-col gap-2">
            <label className="font-display font-bold text-gray-700 text-xs tracking-widest uppercase">
              Club Name
            </label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="e.g. Smash Club"
              className="input-field text-xl font-display font-bold"
            />
          </div>

          {/* Courts */}
          <div className="flex flex-col gap-3">
            <label className="font-display font-bold text-gray-700 text-xs tracking-widest uppercase">
              Number of Courts Tonight
            </label>

            {/* Large number input with +/- controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNumCourts((n) => Math.max(1, n - 1))}
                className="w-14 h-14 rounded-2xl bg-orange-100 border-2 border-orange-200
                           font-display font-black text-2xl text-orange-600
                           hover:bg-orange-200 active:scale-95 transition-all flex-shrink-0"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={numCourts}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 1 && v <= 20) setNumCourts(v);
                }}
                className="flex-1 h-14 rounded-2xl border-2 border-orange-300 text-center
                           font-display font-black text-3xl text-orange-600
                           focus:outline-none focus:border-orange-500 bg-white"
              />
              <button
                onClick={() => setNumCourts((n) => Math.min(20, n + 1))}
                className="w-14 h-14 rounded-2xl bg-orange-100 border-2 border-orange-200
                           font-display font-black text-2xl text-orange-600
                           hover:bg-orange-200 active:scale-95 transition-all flex-shrink-0"
              >
                +
              </button>
            </div>

            {/* Quick-pick buttons */}
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumCourts(n)}
                  className={`flex-1 h-9 rounded-xl font-display font-bold text-sm
                    transition-all duration-150 active:scale-95 border-2
                    ${numCourts === n
                      ? "bg-orange-500 text-white border-orange-400"
                      : "bg-orange-50 text-orange-500 border-orange-200 hover:border-orange-400"
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-400 font-body text-center">
              {numCourts} court{numCourts !== 1 ? "s" : ""} — up to <strong>{numCourts * 4}</strong> players active at once
            </p>
          </div>

          {/* Club details preview */}
          {(clubConfig.venue || clubConfig.nightDay) && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex flex-col gap-1">
              {clubConfig.venue && (
                <p className="text-sm text-orange-700 font-body">
                  📍 {clubConfig.venue}
                </p>
              )}
              {clubConfig.nightDay && clubConfig.nightStart && (
                <p className="text-sm text-orange-700 font-body">
                  🕖 {clubConfig.nightDay}s · {clubConfig.nightStart.replace(":", "h")} – {clubConfig.nightEnd.replace(":", "h")}
                </p>
              )}
            </div>
          )}

          {/* Info notice */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-sm text-orange-700 font-body">
            🏸 Players check in as they arrive — their order in the queue follows check-in time.
          </div>

          {/* Start button */}
          <Button
            size="xl"
            fullWidth
            onClick={handleStart}
            disabled={!clubName.trim() || starting}
            className="mt-1 text-xl tracking-wide"
          >
            {starting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Starting…
              </>
            ) : (
              <>🏸 Start Night!</>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
