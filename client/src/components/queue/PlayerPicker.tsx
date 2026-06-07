import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueueStore, useMemberStore, useMatchStore } from "../../store";
import Avatar from "../shared/Avatar";
import Button from "../shared/Button";
import SpeechBubble from "./SpeechBubble";
import { matchesApi, queueApi } from "../../services/api";
import { useSessionStore } from "../../store";

export default function PlayerPicker() {
  const { picker, togglePick, closePicker, removeFromQueue, activeMemberIds, setActiveMemberIds } = useQueueStore();
  const { members } = useMemberStore();
  const { updateCourtStatus } = useSessionStore();
  const { addMatch } = useMatchStore();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"pick" | "pairs">("pick");
  // pairs: Record<memberId, "A" | "B">
  const [pairs, setPairs] = useState<Record<string, "A" | "B">>({});

  useEffect(() => {
    if (!picker.isOpen) {
      setHoveredId(null);
      setStep("pick");
      setPairs({});
    }
  }, [picker.isOpen]);

  if (!picker.isOpen || !picker.picker_id) return null;

  const picker_member = members[picker.picker_id];
  const allFourIds = picker.picker_id ? [picker.picker_id, ...picker.picked] : [];
  const canProceedToPairs = picker.picked.length === 3;

  const teamA = allFourIds.filter((id) => pairs[id] === "A");
  const teamB = allFourIds.filter((id) => pairs[id] === "B");
  const canConfirm = teamA.length === 2 && teamB.length === 2;

  function handleGoToPairs() {
    if (!picker.picker_id) return;
    // Default pairing: picker + picked[0] = A, picked[1] + picked[2] = B
    const defaultPairs: Record<string, "A" | "B"> = {
      [picker.picker_id]: "A",
      [picker.picked[0]]: "A",
      [picker.picked[1]]: "B",
      [picker.picked[2]]: "B",
    };
    setPairs(defaultPairs);
    setStep("pairs");
  }

  function toggleTeam(id: string) {
    setPairs((prev) => ({ ...prev, [id]: prev[id] === "A" ? "B" : "A" }));
  }

  async function handleConfirm() {
    if (!canConfirm || !picker.target_court) return;
    setConfirming(true);
    try {
      const session = useSessionStore.getState().session;
      if (!session) return;

      const { match } = await matchesApi.start(session.id, {
        court_id: picker.target_court,
        team_a: teamA as [string, string],
        team_b: teamB as [string, string],
      });

      addMatch(match);
      updateCourtStatus(picker.target_court, "playing", match.id);

      // Delete from Supabase so re-queue after match puts them at correct position
      await Promise.all(allFourIds.map((id) => queueApi.remove(session.id, id).catch(() => {})));

      allFourIds.forEach(removeFromQueue);
      setActiveMemberIds(new Set([...activeMemberIds, ...allFourIds]));
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
          {step === "pick" ? (
            <>
              {/* Header */}
              <div className="text-center mb-6">
                <p className="text-brand-600 font-display font-bold text-lg">
                  Court {picker.target_court}
                </p>
                <h2 className="text-3xl font-display font-black text-brand-900">
                  {picker_member?.name}'s pick! 🏸
                </h2>
                <p className="text-brand-600 mt-1">
                  Choose <strong>3 players</strong> from the queue — picked{" "}
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
                      animate={!isPicked ? { y: [0, -6, 0] } : { scale: [1, 1.05, 1] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.2 + (idx % 3) * 0.2,
                        ease: "easeInOut",
                      }}
                    >
                      <SpeechBubble visible={isHovered && !isPicked} memberId={candidate.member_id} />
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
                        {isPicked && <span className="text-2xl">✓</span>}
                      </button>
                    </motion.div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-4 justify-end">
                <Button variant="ghost" onClick={closePicker}>Cancel</Button>
                <Button size="lg" disabled={!canProceedToPairs} onClick={handleGoToPairs}>
                  Choose Pairs →
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Pairs step header */}
              <div className="text-center mb-6">
                <p className="text-brand-600 font-display font-bold text-lg">
                  Court {picker.target_court}
                </p>
                <h2 className="text-3xl font-display font-black text-brand-900">
                  Choose Pairs 🤝
                </h2>
                <p className="text-brand-600 mt-1">
                  Tap a player to switch their team — need <strong>2 vs 2</strong>
                </p>
              </div>

              {/* Team display */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {(["A", "B"] as const).map((team) => {
                  const teamMembers = allFourIds.filter((id) => pairs[id] === team);
                  return (
                    <div
                      key={team}
                      className={`rounded-3xl p-5 border-3 ${
                        team === "A"
                          ? "bg-blue-50 border-blue-300"
                          : "bg-orange-50 border-orange-300"
                      }`}
                    >
                      <p className={`text-center font-display font-black text-lg mb-4 ${
                        team === "A" ? "text-blue-700" : "text-orange-700"
                      }`}>
                        Team {team} {teamMembers.length === 2 ? "✓" : `(${teamMembers.length}/2)`}
                      </p>
                      <div className="flex flex-col gap-3">
                        {teamMembers.map((id) => {
                          const m = members[id];
                          return (
                            <motion.button
                              key={id}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => toggleTeam(id)}
                              className={`flex items-center gap-3 p-3 rounded-2xl bg-white shadow-sm border-2 w-full text-left
                                ${team === "A" ? "border-blue-200 hover:border-blue-400" : "border-orange-200 hover:border-orange-400"}`}
                            >
                              <Avatar
                                name={m?.name ?? ""}
                                url={m?.avatar_url}
                                memberType={m?.member_type}
                                size="md"
                              />
                              <span className="font-display font-bold text-brand-900 text-sm">
                                {m?.name}
                              </span>
                              <span className="ml-auto text-xs text-brand-400">tap to switch</span>
                            </motion.button>
                          );
                        })}
                        {teamMembers.length < 2 && (
                          <div className={`h-14 rounded-2xl border-2 border-dashed flex items-center justify-center text-sm
                            ${team === "A" ? "border-blue-300 text-blue-400" : "border-orange-300 text-orange-400"}`}>
                            + 1 more player
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-4 justify-end">
                <Button variant="ghost" onClick={() => setStep("pick")}>← Back</Button>
                <Button variant="ghost" onClick={closePicker}>Cancel</Button>
                <Button size="lg" disabled={!canConfirm || confirming} onClick={handleConfirm}>
                  {confirming ? "Starting…" : "Start Match 🏸"}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
