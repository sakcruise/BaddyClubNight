import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMatchStore, useMemberStore, useSessionStore } from "../../store";
import { matchesApi } from "../../services/api";
import Avatar from "../shared/Avatar";
import Button from "../shared/Button";

interface Props {
  matchId: string;
  onClose: () => void;
}

export default function ScoreEntry({ matchId, onClose }: Props) {
  const { matches, updateMatch } = useMatchStore();
  const { members } = useMemberStore();
  const match = matches.find((m) => m.id === matchId);

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!match) return null;

  const teamA = match.team_a.map((id) => members[id]).filter(Boolean);
  const teamB = match.team_b.map((id) => members[id]).filter(Boolean);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await matchesApi.score(matchId, scoreA, scoreB);
      updateMatch(matchId, updated.match);
      onClose();
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
        <span className="w-16 text-center font-display font-black text-5xl text-brand-900">
          {value}
        </span>
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
          <h2 className="text-2xl font-display font-black text-brand-900 text-center mb-6">
            Enter Score — Court {match.court_id}
          </h2>

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

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" size="lg" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Score ✓"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
