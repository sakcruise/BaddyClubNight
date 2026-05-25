import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueueStore, useMemberStore, useMatchStore } from "../../store";
import Avatar from "../shared/Avatar";
import Button from "../shared/Button";
import SpeechBubble from "./SpeechBubble";
import { matchesApi } from "../../services/api";
import { useSessionStore } from "../../store";

export default function PlayerPicker() {
  const { picker, togglePick, closePicker, removeFromQueue, activeMemberIds, setActiveMemberIds } = useQueueStore();
  const { members } = useMemberStore();
  const { updateCourtStatus } = useSessionStore();
  const { addMatch } = useMatchStore();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!picker.isOpen) setHoveredId(null);
  }, [picker.isOpen]);

  if (!picker.isOpen || !picker.picker_id) return null;

  const picker_member = members[picker.picker_id];
  const canConfirm = picker.picked.length === 3;

  async function handleConfirm() {
    if (!canConfirm || !picker.picker_id || !picker.target_court) return;
    setConfirming(true);
    try {
      const session = useSessionStore.getState().session;
      if (!session) return;

      const [p1, p2] = [picker.picker_id, picker.picked[0]];
      const [p3, p4] = [picker.picked[1], picker.picked[2]];
      const allFour = [p1, p2, p3, p4];

      const { match } = await matchesApi.start(session.id, {
        court_id: picker.target_court,
        team_a: [p1, p2],
        team_b: [p3, p4],
      });

      addMatch(match);
      updateCourtStatus(picker.target_court, "playing", match.id);
      allFour.forEach(removeFromQueue);
      setActiveMemberIds(new Set([...activeMemberIds, ...allFour]));
      closePicker();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-brand-50 rounded-4xl shadow-2xl w-full max-w-3xl p-8"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <p className="text-brand-600 font-display font-bold text-lg">
              Court {picker.target_court}
            </p>
            <h2 className="text-3xl font-display font-black text-brand-900">
              {picker_member?.name}'s pick! 🏸
            </h2>
            <p className="text-brand-600 mt-1">
              Choose <strong>3 teammates</strong> from the queue — picked{" "}
              <strong>{picker.picked.length}/3</strong>
            </p>
          </div>

          {/* Candidate cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {picker.candidates.map((candidate, idx) => {
              const isPicked = picker.picked.includes(candidate.member_id);
              const isHovered = hoveredId === candidate.member_id;

              return (
                <motion.div
                  key={candidate.member_id}
                  className="relative"
                  animate={
                    !isPicked
                      ? { y: [0, -6, 0] }
                      : { scale: [1, 1.05, 1] }
                  }
                  transition={{
                    repeat: Infinity,
                    duration: 1.2 + (idx % 3) * 0.2,
                    ease: "easeInOut",
                  }}
                >
                  <SpeechBubble
                    visible={isHovered && !isPicked}
                    memberId={candidate.member_id}
                  />
                  <button
                    className={`w-full flex flex-col items-center gap-2 p-4 rounded-3xl
                      border-3 transition-all duration-150 font-display
                      ${isPicked
                        ? "bg-brand-500 border-brand-600 text-white shadow-lg scale-105"
                        : "bg-white border-brand-200 hover:border-brand-400 hover:shadow-md text-brand-900"
                      }`}
                    onMouseEnter={() => setHoveredId(candidate.member_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => togglePick(candidate.member_id)}
                  >
                    <Avatar
                      name={candidate.member.name}
                      url={candidate.member.avatar_url}
                      memberType={candidate.member.member_type}
                      size="lg"
                    />
                    <span className="font-bold text-sm text-center leading-tight">
                      {candidate.member.name}
                    </span>
                    <span className={`text-xs ${isPicked ? "text-brand-100" : "text-brand-400"}`}>
                      #{candidate.position} in queue
                    </span>
                    {isPicked && (
                      <span className="text-2xl">✓</span>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <Button variant="ghost" onClick={closePicker}>
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={!canConfirm || confirming}
              onClick={handleConfirm}
            >
              {confirming ? "Starting…" : "Start Match 🏸"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
