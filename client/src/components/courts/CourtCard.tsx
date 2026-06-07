import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Court, Match } from "../../types";
import { useMemberStore } from "../../store";
import Avatar from "../shared/Avatar";
import ScoreInput from "../shared/ScoreInput";
import { formatScore } from "../../utils/scoring";

function useMatchTimer(startedAt?: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface Props {
  court: Court;
  match?: Match;
  onComplete?: (matchId: string, scoreA?: number, scoreB?: number, shuttles?: number) => void;
  onGo?: () => void;
  completing?: boolean;
  onEditPairs?: () => void;
  editingPairs?: boolean;
  onSavePairs?: (matchId: string, teamA: [string, string], teamB: [string, string]) => Promise<void>;
  onCancelEditPairs?: () => void;
}

export default function CourtCard({ court, match, onComplete, onGo, completing, onEditPairs, editingPairs, onSavePairs, onCancelEditPairs }: Props) {
  const { members } = useMemberStore();
  const [showScore, setShowScore] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [shuttles, setShuttles] = useState(1);
  const [pairMap, setPairMap] = useState<Record<string, "A" | "B">>({});
  const [savingPairs, setSavingPairs] = useState(false);

  const isPlaying = court.status === "playing" && match;
  const teamA = match?.team_a.map((id) => members[id]).filter(Boolean) ?? [];
  const teamB = match?.team_b.map((id) => members[id]).filter(Boolean) ?? [];
  const timer = useMatchTimer(isPlaying ? match.started_at : undefined);

  // Initialise pairMap whenever edit mode opens
  useEffect(() => {
    if (editingPairs && match) {
      const map: Record<string, "A" | "B"> = {};
      match.team_a.forEach((id) => { map[id] = "A"; });
      match.team_b.forEach((id) => { map[id] = "B"; });
      setPairMap(map);
    }
  }, [editingPairs, match]);

  async function handleSavePairs() {
    if (!match || !onSavePairs) return;
    const allFour = [...match.team_a, ...match.team_b];
    const newTeamA = allFour.filter((id) => pairMap[id] === "A") as [string, string];
    const newTeamB = allFour.filter((id) => pairMap[id] === "B") as [string, string];
    if (newTeamA.length !== 2 || newTeamB.length !== 2) return;
    setSavingPairs(true);
    try {
      await onSavePairs(match.id, newTeamA, newTeamB);
    } finally {
      setSavingPairs(false);
    }
  }

  function handleDone(withScore: boolean) {
    if (!onComplete || !match) return;
    if (withScore) {
      onComplete(match.id, scoreA, scoreB, shuttles);
    } else {
      onComplete(match.id);
    }
    setShowScore(false);
  }

  return (
    <motion.div
      layout
      className={`rounded-2xl flex flex-col gap-3 p-4 transition-all duration-300 relative
        ${isPlaying ? "court-glow border-2 border-green-400/50" : "border-2 border-gray-100 bg-gray-50/50"}`}
      style={isPlaying ? { background: "linear-gradient(135deg, #f0fdf4, #dcfce7 60%, #f0fdf4)" } : {}}
    >
      {/* Court number badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-base
              ${isPlaying ? "bg-green-500 text-white shadow-md shadow-green-500/30" : "bg-gray-200 text-gray-500"}`}
          >
            {court.id}
          </div>
          <span className={`font-display font-black text-base ${isPlaying ? "text-green-800" : "text-gray-500"}`}>
            Court {court.id}
          </span>
        </div>

        {isPlaying ? (
          <div className="flex items-center gap-1.5 bg-green-100 border border-green-300/60 rounded-xl px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-green-700 font-display font-black text-xs">LIVE</span>
          </div>
        ) : (
          <span className="text-xs font-display font-bold text-gray-400 bg-gray-100 rounded-xl px-3 py-1">
            Free
          </span>
        )}
      </div>

      {isPlaying ? (
        <>
          {/* Teams */}
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 flex flex-col items-center gap-1 bg-white/60 rounded-xl p-1.5 min-w-0">
              <div className="flex gap-0.5 justify-center">
                {teamA.map((m) => (
                  <Avatar key={m.id} name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                ))}
              </div>
              <div className="w-full text-center">
                {teamA.map((m) => (
                  <div key={m.id} className="text-[10px] font-display font-bold text-gray-700 leading-tight w-full break-words">
                    {m.name.split(" ")[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Shuttlecock bounce + timer */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0 w-10">
              <motion.div
                animate={{ x: [0, 14, 0, -14, 0], rotate: [0, 20, 0, -20, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="text-base leading-none select-none"
              >
                🏸
              </motion.div>
              <div className="text-[9px] font-display font-black text-green-700 tabular-nums leading-none bg-green-100 rounded-lg px-1.5 py-0.5">
                {timer}
              </div>
              <div className="text-gray-400 text-[9px] font-display font-bold">vs</div>
              {(match.score_a != null && match.score_b != null) && (
                <div className="text-xs font-display font-black text-gray-800 tabular-nums leading-none">
                  {formatScore(match.score_a, match.score_b)}
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center gap-1 bg-white/60 rounded-xl p-1.5 min-w-0">
              <div className="flex gap-0.5 justify-center">
                {teamB.map((m) => (
                  <Avatar key={m.id} name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                ))}
              </div>
              <div className="w-full text-center">
                {teamB.map((m) => (
                  <div key={m.id} className="text-[10px] font-display font-bold text-gray-700 leading-tight w-full break-words">
                    {m.name.split(" ")[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Score entry (shown after clicking Match Done) */}
          {showScore && (
            <div className="bg-white/80 border border-green-200 rounded-xl p-2 flex flex-col gap-2">
              <p className="text-[10px] font-display font-bold text-gray-400 text-center uppercase tracking-wide">Final score</p>
              {/* Compact single-row score row */}
              <div className="flex items-center justify-center gap-2">
                {/* Team A score */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-display font-bold text-gray-400 truncate max-w-[60px] text-center">
                    {teamA.map(m => m.name.split(" ")[0]).join(" & ")}
                  </span>
                  <ScoreInput label="" value={scoreA} onChange={setScoreA} />
                </div>
                <span className="text-gray-300 font-black text-lg mt-3">–</span>
                {/* Team B score */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-display font-bold text-gray-400 truncate max-w-[60px] text-center">
                    {teamB.map(m => m.name.split(" ")[0]).join(" & ")}
                  </span>
                  <ScoreInput label="" value={scoreB} onChange={setScoreB} />
                </div>
              </div>
              {/* Shuttles used */}
              <div className="flex items-center justify-center gap-3 py-1 border-t border-green-100">
                <span className="text-[10px] font-display font-bold text-gray-500">🏸 Shuttles used</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShuttles(s => Math.max(0, s - 1))}
                    className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 font-black text-sm flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all">
                    −
                  </button>
                  <span className="font-display font-black text-sm text-gray-800 w-4 text-center tabular-nums">{shuttles}</span>
                  <button onClick={() => setShuttles(s => s + 1)}
                    className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 font-black text-sm flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all">
                    +
                  </button>
                </div>
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => handleDone(false)}
                  disabled={completing}
                  className="flex-1 py-1.5 rounded-xl border border-gray-200 text-gray-500 text-xs
                             font-display font-bold hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  onClick={() => handleDone(true)}
                  disabled={completing}
                  className="flex-1 py-1.5 rounded-xl bg-green-500 text-white text-xs
                             font-display font-bold hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  {completing ? "…" : "✓ Done"}
                </button>
              </div>
            </div>
          )}

          {/* Edit Pairs inline */}
          {editingPairs && match && (
            <div className="bg-white/80 border border-blue-200 rounded-xl p-2 flex flex-col gap-2">
              <p className="text-[10px] font-display font-bold text-gray-400 text-center uppercase tracking-wide">Edit Pairs</p>
              {(["A", "B"] as const).map((team) => {
                const teamMembers = [...match.team_a, ...match.team_b].filter((id) => pairMap[id] === team);
                return (
                  <div key={team} className={`rounded-xl p-1.5 border ${team === "A" ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
                    <p className={`text-[9px] font-display font-black mb-1 ${team === "A" ? "text-blue-600" : "text-orange-600"}`}>
                      Team {team} {teamMembers.length === 2 ? "✓" : `(${teamMembers.length}/2)`}
                    </p>
                    {teamMembers.map((id) => {
                      const m = members[id];
                      return (
                        <button
                          key={id}
                          onClick={() => setPairMap((p) => ({ ...p, [id]: p[id] === "A" ? "B" : "A" }))}
                          className={`flex items-center gap-1.5 w-full p-1 rounded-lg bg-white border text-left mb-1 active:scale-95 transition-all
                            ${team === "A" ? "border-blue-200 hover:border-blue-400" : "border-orange-200 hover:border-orange-400"}`}
                        >
                          <Avatar name={m?.name ?? ""} memberType={m?.member_type} size="sm" />
                          <span className="font-display font-bold text-[10px] text-gray-800 flex-1 truncate">{m?.name}</span>
                          <span className="text-[9px] text-gray-400">switch</span>
                        </button>
                      );
                    })}
                    {teamMembers.length < 2 && (
                      <div className={`h-7 rounded-lg border border-dashed flex items-center justify-center text-[9px]
                        ${team === "A" ? "border-blue-300 text-blue-400" : "border-orange-300 text-orange-400"}`}>
                        + 1 more
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-1">
                <button onClick={onCancelEditPairs} className="flex-1 py-1 rounded-lg border border-gray-200 text-gray-500 text-[10px] font-display font-bold hover:bg-gray-50">Cancel</button>
                <button
                  onClick={handleSavePairs}
                  disabled={savingPairs || Object.values(pairMap).filter(v => v === "A").length !== 2}
                  className="flex-1 py-1 rounded-lg bg-blue-500 text-white text-[10px] font-display font-bold disabled:opacity-50 hover:bg-blue-600"
                >
                  {savingPairs ? "…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Match Done button */}
          {!showScore && !editingPairs && onComplete && (
            <div className="flex gap-1.5">
              {onEditPairs && (
                <button
                  onClick={onEditPairs}
                  className="py-2.5 px-3 rounded-xl font-display font-bold text-xs border border-gray-200
                             bg-white text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  ✏️ Pairs
                </button>
              )}
              <button
                onClick={() => { setScoreA(0); setScoreB(0); setShowScore(true); }}
                disabled={completing}
                className="flex-1 py-2.5 rounded-xl font-display font-bold text-sm
                           bg-green-500 hover:bg-green-600 text-white disabled:opacity-60
                           active:scale-95 transition-all duration-150 shadow-sm shadow-green-500/30"
              >
                {completing ? "Finishing…" : "✓ Match Done"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-3">
          <span className="text-3xl opacity-20">🏸</span>
          {onGo ? (
            <button
              onClick={onGo}
              className="w-full py-2.5 rounded-xl font-display font-black text-sm
                         bg-gradient-to-r from-orange-500 to-orange-400 text-white
                         hover:from-orange-600 hover:to-orange-500
                         active:scale-95 transition-all duration-150 shadow-md shadow-orange-500/30"
            >
              🏸 Go!
            </button>
          ) : (
            <span className="text-xs font-display font-bold text-gray-400">Available</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
