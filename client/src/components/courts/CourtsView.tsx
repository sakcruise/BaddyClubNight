import { useState, useEffect } from "react";
import { useSessionStore, useMatchStore, useQueueStore, useMemberStore } from "../../store";
import CourtCard from "./CourtCard";
import { Toast } from "../shared/Toast";
import { LayoutGrid } from "lucide-react";
import { matchesApi, queueApi } from "../../services/api";
import { autoPick, recentTeamPairs } from "../../utils/autoPick";
import type { PitstopState } from "../../types";

export default function CourtsView() {
  const { courts, updateCourtStatus, session, clubConfig } = useSessionStore();
  const { matches, updateMatch } = useMatchStore();
  const { queue, activeMemberIds, setActiveMemberIds, openPicker, setQueue, pitstops, removeFirstPitstop, addPitstops } = useQueueStore();
  const { members } = useMemberStore();
  const [completing, setCompleting] = useState<string | null>(null);
  const [editingPairs, setEditingPairs] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-fill pitstops proactively whenever queue/courts change (auto-pick mode)
  useEffect(() => {
    if (!clubConfig.autoPickEnabled) return;

    // Fill up to 2 pitstop slots — run in a loop so both can be filled in one effect fire
    const memberMap = { ...members };
    queue.forEach((q) => { if (!memberMap[q.member_id] && q.member) memberMap[q.member_id] = q.member; });
    const completedMatches = useMatchStore.getState().matches;
    const teamHistPairs = recentTeamPairs(
      completedMatches.filter((m) => m.result === "complete").map((m) => ({
        team_a: m.team_a, team_b: m.team_b, result: m.result,
      }))
    );

    // Compute both pitstops fully before touching the store — avoids any
    // race where a re-render between addPitstop calls resets the exclusion set
    const currentPitstops = useQueueStore.getState().pitstops;
    const slotsNeeded = 2 - currentPitstops.length;
    if (slotsNeeded <= 0) return;

    const freshActiveIds = useQueueStore.getState().activeMemberIds;
    const freshQueue = useQueueStore.getState().queue;

    // Seed excluded with players already in existing pitstops
    const excludedIds = new Set<string>(currentPitstops.flatMap((p) => p.players));

    const newPitstops: PitstopState[] = [];
    for (let i = 0; i < slotsNeeded; i++) {
      const eligible = freshQueue
        .filter((q) => !freshActiveIds.has(q.member_id) && !excludedIds.has(q.member_id))
        .sort((a, b) => a.position - b.position)
        .map((q) => q.member_id);
      if (eligible.length < 4) break;
      const picked = autoPick(eligible, memberMap, clubConfig.autoPickMode, teamHistPairs);
      if (!picked) break;
      newPitstops.push(picked);
      // Immediately exclude these players so the next iteration can't pick them
      picked.players.forEach((id) => excludedIds.add(id));
    }

    // Write both pitstops in a single atomic store update.
    // Players stay in `queue` (still checked in) — they're just earmarked and hidden
    // from queue display / candidate lists until launched or the pitstop is cancelled.
    if (newPitstops.length === 1) useQueueStore.getState().addPitstop(newPitstops[0]);
    if (newPitstops.length === 2) addPitstops(newPitstops[0], newPitstops[1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, activeMemberIds.size, pitstops.length, clubConfig.autoPickEnabled]);

  // Speak announcements via state so the effect has a stable dep and only fires once per message.
  // NOTE: no cancel() before speak() — cancelling here stomps on Chrome's speech queue and can
  // silently break the picking-voice cycle in CheckInPanel (same bug fixed there previously).
  useEffect(() => {
    if (!announcement || !("speechSynthesis" in window)) return;
    const utt = new SpeechSynthesisUtterance(announcement);
    utt.rate = 0.82; utt.pitch = 1.1; utt.volume = 1;
    window.speechSynthesis.speak(utt);
    setAnnouncement(null);
  }, [announcement]);

  async function handleGo(courtId: number) {
    // Exclude on-court players and anyone already earmarked for a pitstop
    const pitstopPlayerIds = new Set(pitstops.flatMap((ps) => ps.players));
    const candidates = queue
      .filter((q) => !activeMemberIds.has(q.member_id) && !pitstopPlayerIds.has(q.member_id) && members[q.member_id])
      .map((q) => ({ ...q, member: members[q.member_id] }))
      .sort((a, b) => a.position - b.position);

    if (candidates.length < 4) {
      setToast(`Need at least 4 players in the queue (have ${candidates.length})`);
      return;
    }

    // Auto-pick mode: skip the picker, pick best 4 and start match immediately
    if (clubConfig.autoPickEnabled && session) {
      const eligible = candidates.map((q) => q.member_id);
      const completedMatches = useMatchStore.getState().matches;
      const teamHistPairs = recentTeamPairs(
        completedMatches.filter((m) => m.result === "complete").map((m) => ({
          team_a: m.team_a, team_b: m.team_b, result: m.result,
        }))
      );
      const picked = autoPick(eligible, members, clubConfig.autoPickMode, teamHistPairs);
      if (picked) {
        const { players, pairs } = picked;
        const teamA = players.filter((id) => pairs[id] === "A") as [string, string];
        const teamB = players.filter((id) => pairs[id] === "B") as [string, string];
        const { match } = await matchesApi.start(session.id, { court_id: courtId, team_a: teamA, team_b: teamB });
        useMatchStore.getState().addMatch(match);
        updateCourtStatus(courtId, "playing", match.id);
        players.forEach(useQueueStore.getState().removeFromQueue);
        setActiveMemberIds(new Set([...activeMemberIds, ...players]));
        const names = players.map((id) => members[id]?.name.split(" ")[0]).filter(Boolean).join(", ");
        setAnnouncement(`Court ${courtId} is live! ${names}, you're on!`);
        return;
      }
    }

    // Manual pick: open picker as before
    const firstPicker = candidates[0];
    openPicker(firstPicker.member_id, candidates.slice(1), courtId);
  }

  async function handleLaunchPitstop(courtId: number) {
    const ps = pitstops[0];
    if (!ps || !session) return;
    const { players, pairs } = ps;
    const teamA = players.filter((id) => pairs[id] === "A") as [string, string];
    const teamB = players.filter((id) => pairs[id] === "B") as [string, string];
    if (teamA.length !== 2 || teamB.length !== 2) return;

    const { match } = await matchesApi.start(session.id, { court_id: courtId, team_a: teamA, team_b: teamB });
    useMatchStore.getState().addMatch(match);
    updateCourtStatus(courtId, "playing", match.id);
    players.forEach(useQueueStore.getState().removeFromQueue);
    setActiveMemberIds(new Set([...activeMemberIds, ...players]));
    removeFirstPitstop();
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

      // Step 5: re-queue at the bottom — winners first, then losers
      if (session) {
        const aWon = match.score_a !== undefined && match.score_b !== undefined
          ? match.score_a >= match.score_b
          : true;
        const winners = aWon ? [...match.team_a] : [...match.team_b];
        const losers  = aWon ? [...match.team_b] : [...match.team_a];
        const requeueOrder = [...winners, ...losers];

        // Force-delete all 4 first (ignore errors), then re-insert in order
        // Using remove() not checkIn() to avoid ignoreDuplicates keeping old position
        await Promise.all(requeueOrder.map((id) => queueApi.remove(session.id, id).catch(() => {})));
        for (const memberId of requeueOrder) {
          await queueApi.checkInForce(session.id, memberId);
        }
        const { queue: refreshed } = await queueApi.get(session.id);
        setQueue(refreshed);
      }

      // Step 6: announce court free — pitstop launches when admin taps court card
      const hasPitstop = useQueueStore.getState().pitstops.length > 0;
      setAnnouncement(
        hasPitstop
          ? `Court ${match.court_id} is free! Pitstop team, get ready!`
          : `Court ${match.court_id} is free! Next players, get ready!`
      );
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

  // Multi-column grid only kicks in at md+ (desktop 3-panel layout). On mobile
  // (single-panel tab view) courts always stack in one column so cards get
  // full width instead of being squeezed side by side.
  const desktopCols = courts.length <= 2 ? courts.length : courts.length <= 4 ? 2 : 3;
  const desktopColsClass = desktopCols === 1 ? "md:grid-cols-1" : desktopCols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  return (
    <>
    <Toast message={toast} onDone={() => setToast(null)} type="error" />
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

      {/* Courts grid — single column on mobile, computed columns from md+ */}
      <div className={`flex-1 grid grid-cols-1 ${desktopColsClass} gap-3 content-start overflow-y-auto min-h-0`}>
        {(() => {
          // Only the first idle court gets the pitstop launch button (avoids ambiguity)
          const firstIdleCourtId = courts.find((c) => c.status !== "playing")?.id ?? null;
          const showPitstopOn = firstIdleCourtId;
          return courts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              match={activeMatches[court.id]}
              onComplete={court.status === "playing" && activeMatches[court.id]
                ? (id, a, b, s) => handleComplete(id, a, b, s)
                : undefined}
              // In auto-pick mode, "Go!" is replaced by pitstop launch — no manual picker
              onGo={court.status !== "playing" && !clubConfig.autoPickEnabled ? () => handleGo(court.id) : undefined}
              autoPickEnabled={clubConfig.autoPickEnabled}
              completing={completing === activeMatches[court.id]?.id}
              onEditPairs={activeMatches[court.id]
                ? () => setEditingPairs(activeMatches[court.id].id)
                : undefined}
              editingPairs={editingPairs === activeMatches[court.id]?.id}
              onSavePairs={handleSavePairs}
              onCancelEditPairs={() => setEditingPairs(null)}
            />
          ));
        })()}
      </div>

    </div>
    </>
  );
}
