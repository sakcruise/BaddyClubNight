import { useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, LogOut, Repeat } from "lucide-react";
import { computeLeaderboard } from "../../utils/scoring";
import Avatar from "./Avatar";
import type { Match, Member, MemberType } from "../../types";

interface Props {
  matches: Match[];
  members: Record<string, Member>;
  onConfirm: () => void;
  onCancel: () => void;
  ending: boolean;
}

// Lightweight confetti burst
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const COLORS = ["#f59e0b", "#ea580c", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6"];
    const pieces = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 60,
      r: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      spin: Math.random() * 0.3,
      angle: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let raf: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 120);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.vy += 0.04;
      }
      frame++;
      if (frame < 140) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none rounded-3xl"
    />
  );
}

function MedalCard({
  rank, name, memberType, label, value, subValue, delay,
}: {
  rank: 1 | 2 | 3;
  name: string;
  memberType?: MemberType;
  label: string;
  value: string;
  subValue?: string;
  delay: number;
}) {
  const medals = {
    1: { bg: "from-amber-50 to-yellow-50",  border: "border-amber-200", badge: "bg-amber-400",  icon: "🥇" },
    2: { bg: "from-gray-50 to-slate-50",    border: "border-gray-200",  badge: "bg-gray-400",   icon: "🥈" },
    3: { bg: "from-orange-50 to-amber-50",  border: "border-orange-200",badge: "bg-orange-400", icon: "🥉" },
  }[rank];

  return (
    <motion.div
      className={`flex items-center gap-3 p-3 rounded-2xl border bg-gradient-to-r ${medals.bg} ${medals.border}`}
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
    >
      <span className="text-2xl flex-shrink-0">{medals.icon}</span>
      <Avatar name={name} memberType={memberType} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="font-display font-black text-gray-900 text-sm leading-tight truncate">{name}</div>
        <div className="text-gray-500 text-[11px] font-display">{label}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-display font-black text-gray-800 text-sm">{value}</div>
        {subValue && <div className="text-gray-400 text-[10px] font-display">{subValue}</div>}
      </div>
    </motion.div>
  );
}

function AwardCard({
  emoji, title, name, memberType, stat, delay,
}: {
  emoji: string;
  title: string;
  name: string;
  memberType?: MemberType;
  stat: string;
  delay: number;
}) {
  return (
    <motion.div
      className="flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-center"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
    >
      <span className="text-2xl">{emoji}</span>
      <div className="text-[10px] font-display font-black text-gray-400 uppercase tracking-wide">{title}</div>
      <Avatar name={name} memberType={memberType} size="sm" />
      <div className="font-display font-black text-gray-900 text-sm leading-tight">{name}</div>
      <div className="text-orange-600 font-display font-bold text-xs">{stat}</div>
    </motion.div>
  );
}

export default function EndNightCheers({ matches, members, onConfirm, onCancel, ending }: Props) {
  const stats = useMemo(() => computeLeaderboard(matches, members), [matches, members]);

  const top3 = stats.slice(0, 3);
  const topMale = stats.find((s) => s.member?.member_type === "male");
  const topFemale = stats.find((s) => s.member?.member_type === "female");
  const mostPlayed = [...stats].sort((a, b) => b.matches_played - a.matches_played)[0];

  const totalMatches = matches.filter((m) => m.result === "complete").length;
  const hasData = stats.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onCancel}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          initial={{ scale: 0.85, opacity: 0, y: 32 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
        >
          {hasData && <Confetti />}

          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 text-center"
            style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-600)) 60%, rgb(var(--p-500)) 100%)" }}>
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all"
            >
              <X size={15} />
            </button>
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
              className="text-5xl mb-2"
            >
              🏸
            </motion.div>
            <h2 className="font-display font-black text-white text-xl leading-tight">That's a wrap!</h2>
            <p className="text-orange-200 text-sm font-display mt-1">
              {totalMatches} match{totalMatches !== 1 ? "es" : ""} played tonight
            </p>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">

            {!hasData ? (
              <div className="text-center py-8">
                <span className="text-4xl">🏸</span>
                <p className="text-gray-400 font-display font-bold text-sm mt-2">No matches played tonight</p>
              </div>
            ) : (
              <>
                {/* Top 3 overall */}
                {top3.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy size={14} className="text-amber-500" />
                      <span className="text-xs font-display font-black text-gray-500 uppercase tracking-wide">Overall standings</span>
                    </div>
                    <div className="space-y-2">
                      {top3.map((s, i) => (
                        <MedalCard
                          key={s.member_id}
                          rank={(i + 1) as 1 | 2 | 3}
                          name={s.member?.name ?? "?"}
                          memberType={s.member?.member_type}
                          label={`${s.matches_played} match${s.matches_played !== 1 ? "es" : ""}`}
                          value={`${s.wins}W – ${s.losses}L`}
                          subValue={`${Math.round(s.win_rate * 100)}% win rate`}
                          delay={0.15 + i * 0.08}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Gender + most played awards */}
                {(topMale || topFemale || mostPlayed) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-display font-black text-gray-500 uppercase tracking-wide">🏅 Tonight's awards</span>
                    </div>
                    <div className="flex gap-2">
                      {topMale && (
                        <AwardCard
                          emoji="🔵"
                          title="Top Male"
                          name={topMale.member?.name ?? "?"}
                          memberType={topMale.member?.member_type}
                          stat={`${topMale.wins}W / ${topMale.matches_played} games`}
                          delay={0.38}
                        />
                      )}
                      {topFemale && (
                        <AwardCard
                          emoji="🩷"
                          title="Top Female"
                          name={topFemale.member?.name ?? "?"}
                          memberType={topFemale.member?.member_type}
                          stat={`${topFemale.wins}W / ${topFemale.matches_played} games`}
                          delay={0.44}
                        />
                      )}
                      {mostPlayed && (
                        <AwardCard
                          emoji="🎯"
                          title="Most Active"
                          name={mostPlayed.member?.name ?? "?"}
                          memberType={mostPlayed.member?.member_type}
                          stat={`${mostPlayed.matches_played} game${mostPlayed.matches_played !== 1 ? "s" : ""} played`}
                          delay={0.50}
                        />
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-gray-100">
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-gray-200
                text-gray-600 font-display font-bold text-sm hover:bg-gray-50 transition-all"
            >
              <Repeat size={14} /> Keep Playing
            </button>
            <button
              onClick={onConfirm}
              disabled={ending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl
                bg-red-500 text-white font-display font-black text-sm
                hover:bg-red-600 disabled:opacity-60 active:scale-95 transition-all"
            >
              <LogOut size={15} /> {ending ? "Ending night…" : "End Night"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
