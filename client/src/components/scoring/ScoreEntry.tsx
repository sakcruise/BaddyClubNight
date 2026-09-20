import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMatchStore, useMemberStore } from "../../store";
import { matchesApi } from "../../services/api";
import Avatar from "../shared/Avatar";
import Button from "../shared/Button";
import { Delete } from "lucide-react";

interface Props {
  matchId: string;
  onClose: () => void;
  /** Fires after the score is actually saved. If omitted, falls back to onClose
   * so existing callers keep working — pass this when the caller needs to tell
   * "saved" apart from "cancelled" (e.g. to mark something complete only on save). */
  onSaved?: (scoreA: number, scoreB: number) => void;
  /** First-to-N scoring. When set, the operator taps the winning pair (their
   * score becomes N) and keys the loser's score on an on-screen pad, so it
   * works on a touch display with no OS keyboard. */
  targetPoints?: number;
}

type Side = "A" | "B";

export default function ScoreEntry({ matchId, onClose, onSaved, targetPoints }: Props) {
  const { matches, updateMatch } = useMatchStore();
  const { members } = useMemberStore();
  const match = matches.find((m) => m.id === matchId);

  const [scoreA, setScoreA] = useState(match?.score_a ?? 0);
  const [scoreB, setScoreB] = useState(match?.score_b ?? 0);
  // First-to-N mode. Re-opening a scored match pre-selects the winner from the saved score.
  const [winner, setWinner] = useState<Side | null>(() => {
    if (!targetPoints || match?.score_a == null || match?.score_b == null) return null;
    return match.score_a > match.score_b ? "A" : "B";
  });
  const [loserScore, setLoserScore] = useState(() => {
    if (!targetPoints || match?.score_a == null || match?.score_b == null) return 0;
    return Math.min(match.score_a, match.score_b);
  });
  const [saving, setSaving] = useState(false);

  if (!match) return null;

  const teamA = match.team_a.map((id) => members[id]).filter(Boolean);
  const teamB = match.team_b.map((id) => members[id]).filter(Boolean);
  const firstNames = (team: typeof teamA) => team.map((m) => m.name.split(" ")[0]).join(" & ");

  const firstTo = targetPoints ?? 0;
  const finalScores = (): [number, number] => {
    if (!targetPoints) return [scoreA, scoreB];
    return winner === "A" ? [targetPoints, loserScore] : [loserScore, targetPoints];
  };
  const canSave = targetPoints ? winner !== null : true;

  async function handleSave() {
    setSaving(true);
    try {
      const [a, b] = finalScores();
      const updated = await matchesApi.score(matchId, a, b);
      updateMatch(matchId, updated.match);
      if (onSaved) onSaved(a, b);
      else onClose();
    } finally {
      setSaving(false);
    }
  }

  function ScoreButton({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-700 text-2xl font-black
                     hover:bg-brand-200 active:scale-95 transition-all"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? 0 : Math.max(0, n));
          }}
          onFocus={(e) => e.target.select()}
          className="w-20 text-center font-display font-black text-5xl text-brand-900
                     bg-transparent border-b-2 border-brand-200 focus:border-brand-500 focus:outline-none
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          onClick={() => onChange(value + 1)}
          className="w-14 h-14 rounded-2xl bg-brand-500 text-white text-2xl font-black
                     hover:bg-brand-600 active:scale-95 transition-all"
        >
          +
        </button>
      </div>
    );
  }

  // Tap-to-pick winner card. Big enough for a thumb on the wall display.
  function WinnerCard({ side, team }: { side: Side; team: typeof teamA }) {
    const picked = winner === side;
    const lost = winner !== null && !picked;
    return (
      <button
        onClick={() => setWinner(side)}
        className={`flex-1 flex flex-col items-center gap-2 rounded-3xl border-2 px-4 py-4 transition-all active:scale-[0.98]
          ${picked ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-200/60" : lost ? "border-gray-100 bg-gray-50 opacity-60" : "border-brand-200 bg-white hover:border-brand-400"}`}
      >
        <div className="flex -space-x-2">
          {team.map((m) => (
            <Avatar key={m.id} name={m.name} url={m.avatar_url} size="md" />
          ))}
        </div>
        <span className={`font-display font-bold text-sm text-center leading-tight ${picked ? "text-emerald-800" : "text-brand-800"}`}>
          {firstNames(team)}
        </span>
        <span className={`font-display font-black text-4xl tabular-nums ${picked ? "text-emerald-600" : lost ? "text-gray-400" : "text-brand-300"}`}>
          {picked ? firstTo : lost ? loserScore : "–"}
        </span>
        {picked && <span className="text-[10px] font-display font-bold uppercase tracking-widest text-emerald-600">Winner</span>}
      </button>
    );
  }

  // On-screen numeric pad for the loser's score. The loser can't reach the target.
  const maxLoser = Math.max(0, firstTo - 1);
  function pressDigit(d: number) {
    const next = loserScore * 10 + d;
    setLoserScore(next > maxLoser ? d <= maxLoser ? d : loserScore : next);
  }
  function Keypad() {
    const key = "h-14 rounded-2xl font-display font-black text-2xl active:scale-95 transition-all select-none";
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => pressDigit(d)} className={`${key} bg-brand-50 text-brand-900 hover:bg-brand-100`}>
            {d}
          </button>
        ))}
        <button onClick={() => setLoserScore(0)} className={`${key} bg-gray-100 text-gray-500 text-sm hover:bg-gray-200`}>
          Clear
        </button>
        <button onClick={() => pressDigit(0)} className={`${key} bg-brand-50 text-brand-900 hover:bg-brand-100`}>
          0
        </button>
        <button onClick={() => setLoserScore((v) => Math.floor(v / 10))} className={`${key} bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center`}>
          <Delete size={22} />
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-4xl shadow-2xl w-full max-w-lg p-8"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-display font-black text-brand-900 text-center mb-1">
            Enter Score — Court {match.court_id}
          </h2>

          {targetPoints ? (
            <>
              <p className="text-center text-xs font-display font-bold uppercase tracking-widest text-brand-400 mb-5">
                First to {targetPoints}
              </p>
              <p className="text-center text-sm font-display font-semibold text-gray-600 mb-3">
                {winner ? "Now key in the losing score" : "Who won?"}
              </p>
              <div className="flex gap-3 mb-5">
                <WinnerCard side="A" team={teamA} />
                <WinnerCard side="B" team={teamB} />
              </div>

              {winner && (
                <div className="mb-6">
                  <div className="flex items-baseline justify-center gap-2 mb-3">
                    <span className="text-xs font-display font-bold uppercase tracking-widest text-gray-400">
                      {firstNames(winner === "A" ? teamB : teamA)}
                    </span>
                    <span className="font-display font-black text-3xl text-brand-900 tabular-nums">{loserScore}</span>
                  </div>
                  <Keypad />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-6" />
              {/* Team A */}
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="flex gap-3">
                  {teamA.map((m) => (
                    <div key={m.id} className="flex flex-col items-center gap-1">
                      <Avatar name={m.name} url={m.avatar_url} size="md" />
                      <span className="text-xs font-bold text-brand-700">{m.name.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
                <ScoreButton value={scoreA} onChange={setScoreA} />
              </div>

              <div className="text-center text-brand-300 font-display font-black text-xl mb-6">vs</div>

              {/* Team B */}
              <div className="flex flex-col items-center gap-3 mb-8">
                <ScoreButton value={scoreB} onChange={setScoreB} />
                <div className="flex gap-3">
                  {teamB.map((m) => (
                    <div key={m.id} className="flex flex-col items-center gap-1">
                      <Avatar name={m.name} url={m.avatar_url} size="md" />
                      <span className="text-xs font-bold text-brand-700">{m.name.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" size="lg" onClick={handleSave} disabled={saving || !canSave}>
              {saving ? "Saving…" : "Save Score ✓"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
