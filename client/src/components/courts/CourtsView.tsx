import { useState } from "react";
import { useSessionStore, useMatchStore, useQueueStore, useMemberStore } from "../../store";
import CourtCard from "./CourtCard";
import { LayoutGrid } from "lucide-react";
import { matchesApi, queueApi } from "../../services/api";

export default function CourtsView() {
  const { courts, updateCourtStatus, session } = useSessionStore();
  const { matches, updateMatch } = useMatchStore();
  const { queue, activeMemberIds, setActiveMemberIds, openPicker, setQueue } = useQueueStore();
  const { members } = useMemberStore();
  const [completing, setCompleting] = useState<string | null>(null);
  const [editingPairs, setEditingPairs] = useState<string | null>(null); // matchId

  function handleGo(courtId: number) {
    const candidates = queue
      .filter((q) => !activeMemberIds.has(q.member_id) && members[q.member_id])
      .map((q) => ({ ...q, member: members[q.member_id] }))
      .sort((a, b) => a.position - b.position);

    if (candidates.length < 4) {
      alert(`Need at least 4 players in the queue (have ${candidates.length}).`);
      return;
    }

    // Auto-pick the first player in queue as picker
    const firstPicker = candidates[0];
    openPicker(firstPicker.member_id, candidates.slice(1), courtId);
  }

  async function handleComplete(matchId: string, scoreA?: number, scoreB?: number, shuttles?: number) {
    if (completing) return;
    setCompleting(matchId);

    // Find the match in current state so we can reset UI even if API calls fail
    const currentMatch = matches.find((m) => m.id === matchId);
    if (!currentMatch) { setCompleting(null); return; }

    try {
      // Step 1: mark complete — this is the critical call
      let { match } = await matchesApi.complete(matchId);

      // Step 2: save score + shuttles — best-effort, never blocks court reset
      if (scoreA !== undefined && scoreB !== undefined) {
        try {
          ({ match } = await matchesApi.score(matchId, scoreA, scoreB, shuttles));
        } catch (e) {
          console.warn("Score save failed (column may not exist yet):", e);
          // match still has result:"complete" from step 1 — carry on
        }
      }

      // Step 3: always update UI regardless
      updateMatch(matchId, match);
      updateCourtStatus(match.court_id, "idle");

      // Step 4: free the 4 players from activeMemberIds
      const allFour = [...match.team_a, ...match.team_b];
      const next = new Set(activeMemberIds);
      allFour.forEach((id) => next.delete(id));
      setActiveMemberIds(next);

      // Step 5: re-queue all 4 players at the back
      if (session) {
        for (const memberId of allFour) {
          try { await queueApi.checkIn(session.id, memberId); } catch { /* already in queue */ }
        }
        const { queue: refreshed } = await queueApi.get(session.id);
        setQueue(refreshed);
      }
    } catch (e) {
      console.error("handleComplete failed:", e);
      // Even if complete() fails, reset UI so court isn't stuck
      updateCourtStatus(currentMatch.court_id, "idle");
      const allFour = [...currentMatch.team_a, ...currentMatch.team_b];
      const next = new Set(activeMemberIds);
      allFour.forEach((id) => next.delete(id));
      setActiveMemberIds(next);
    } finally {
      setCompleting(null);
    }
  }

  async function handleSavePairs(matchId: string, teamA: [string, string], teamB: [string, string]) {
    const { match } = await matchesApi.updateTeams(matchId, teamA, teamB);
    updateMatch(matchId, match);
    setEditingPairs(null);
  }

  const activeMatches = Object.fromEntries(
    matches
      .filter((m) => m.result === "pending")
      .map((m) => [m.court_id, m])
  );

  const cols = courts.length <= 2 ? courts.length : courts.length <= 4 ? 2 : 3;

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">

      {/* Section header */}
      <div className="section-header mb-0">
        <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
          <LayoutGrid size={18} className="text-green-600" />
        </div>
        <span className="section-title">Courts</span>
        <span className="ml-auto badge bg-green-100 text-green-700 text-xs">
          {Object.keys(activeMatches).length}/{courts.length} active
        </span>
      </div>

      {/* Courts grid */}
      <div
        className="flex-1 grid gap-3 content-start overflow-y-auto min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            match={activeMatches[court.id]}
            onComplete={court.status === "playing" && activeMatches[court.id]
              ? (id, a, b, s) => handleComplete(id, a, b, s)
              : undefined}
            onGo={court.status !== "playing" ? () => handleGo(court.id) : undefined}
            completing={completing === activeMatches[court.id]?.id}
            onEditPairs={activeMatches[court.id]
              ? () => setEditingPairs(activeMatches[court.id].id)
              : undefined}
            editingPairs={editingPairs === activeMatches[court.id]?.id}
            onSavePairs={handleSavePairs}
            onCancelEditPairs={() => setEditingPairs(null)}
          />
        ))}
      </div>

    </div>
  );
}
