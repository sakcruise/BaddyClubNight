import type { QueuePosition, Match, Member } from "../types";

/**
 * After a match: winners go to back first, then losers.
 * Returns the new queue with all 4 players appended in order.
 */
export function requeueAfterMatch(
  queue: QueuePosition[],
  winnerIds: [string, string],
  loserIds: [string, string],
  members: Record<string, Member>
): QueuePosition[] {
  const now = new Date().toISOString();
  const filtered = queue.filter(
    (q) => ![...winnerIds, ...loserIds].includes(q.member_id)
  );

  const newTail: QueuePosition[] = [
    ...winnerIds.map((id) => ({ member_id: id, member: members[id], checked_in_at: now })),
    ...loserIds.map((id) => ({ member_id: id, member: members[id], checked_in_at: now })),
  ].map((p, i) => ({
    ...p,
    position: filtered.length + i + 1,
  }));

  return [...filtered, ...newTail];
}

/**
 * Renumber queue positions to be 1-indexed and contiguous.
 */
export function normalisePositions(queue: QueuePosition[]): QueuePosition[] {
  return queue.map((q, i) => ({ ...q, position: i + 1 }));
}

/**
 * Returns the top N players eligible to be picked (not already on a court,
 * not the picker themselves).
 */
export function getCandidates(
  queue: QueuePosition[],
  pickerId: string,
  activeMemberIds: Set<string>,
  n = 8
): QueuePosition[] {
  return queue
    .filter((q) => q.member_id !== pickerId && !activeMemberIds.has(q.member_id))
    .slice(0, n);
}

/**
 * Remove a member from the queue (e.g. they left early).
 */
export function removeFromQueue(
  queue: QueuePosition[],
  memberId: string
): QueuePosition[] {
  return normalisePositions(queue.filter((q) => q.member_id !== memberId));
}

/**
 * Add a member to the back of the queue.
 */
export function addToQueue(
  queue: QueuePosition[],
  member: Member,
  checkedInAt = new Date().toISOString()
): QueuePosition[] {
  if (queue.some((q) => q.member_id === member.id)) return queue;
  return [
    ...queue,
    { member_id: member.id, member, position: queue.length + 1, checked_in_at: checkedInAt },
  ];
}

/**
 * Given a finished match, determine winners and losers from scores.
 */
export function resolveMatchOutcome(match: Match): {
  winnerIds: [string, string];
  loserIds: [string, string];
} {
  const scoreA = match.score_a ?? 0;
  const scoreB = match.score_b ?? 0;
  if (scoreA >= scoreB) {
    return { winnerIds: match.team_a, loserIds: match.team_b };
  }
  return { winnerIds: match.team_b, loserIds: match.team_a };
}
