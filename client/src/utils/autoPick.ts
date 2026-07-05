import type { Member, PitstopState, AutoPickMode } from "../types";

// All ways to split 4 players into two teams of 2
// Returns [teamA, teamB] pairs (3 unique splits)
function teamSplits(ids: string[]): Array<[string[], string[]]> {
  const [a, b, c, d] = ids;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

// Choose k items from array — returns all combinations
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function scoreTeamSplit(
  teamA: string[],
  teamB: string[],
  members: Record<string, Member>,
  mode: AutoPickMode,
  recentPairs: Set<string>, // "id1|id2" sorted
): number {
  let score = 0;

  const lvl = (id: string) => members[id]?.level ?? 2;
  const sumA = teamA.reduce((s, id) => s + lvl(id), 0);
  const sumB = teamB.reduce((s, id) => s + lvl(id), 0);
  const teamDiff = Math.abs(sumA - sumB);

  if (mode === "balanced") {
    // Both teams should have similar total level — penalise imbalance heavily
    score -= teamDiff * 12;
    // Reward having a wide skill range in the chosen 4 (strong + weak mix)
    const all = [...teamA, ...teamB];
    const levels = all.map(lvl);
    score += (Math.max(...levels) - Math.min(...levels)) * 3;
  } else {
    // "competitive" — pick players close in level, teams evenly matched
    const all = [...teamA, ...teamB];
    const levels = all.map(lvl);
    const range = Math.max(...levels) - Math.min(...levels);
    score -= range * 12;          // tight cluster
    score -= teamDiff * 6;        // still balance the two teams
  }

  // Gender mix bonus: prefer 1 female per team
  const isFemale = (id: string) => members[id]?.member_type === "female";
  const fA = teamA.filter(isFemale).length;
  const fB = teamB.filter(isFemale).length;
  if (fA === 1 && fB === 1) score += 20;
  else if (fA + fB >= 1) score += 5; // at least some gender mix

  // Avoid repeat matchup penalty
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  for (const id1 of teamA) {
    for (const id2 of teamA) {
      if (id1 < id2 && recentPairs.has(pairKey(id1, id2))) score -= 15;
    }
  }
  for (const id1 of teamB) {
    for (const id2 of teamB) {
      if (id1 < id2 && recentPairs.has(pairKey(id1, id2))) score -= 15;
    }
  }

  return score;
}

export function autoPick(
  eligibleQueue: string[],       // member IDs in queue order (position 1 first)
  members: Record<string, Member>,
  mode: AutoPickMode,
  recentMatchTeams: Array<[string, string]>, // team pairs from last few matches
): PitstopState | null {
  const top8 = eligibleQueue.slice(0, 8);
  if (top8.length < 4) return null;

  // Build set of recently-partnered pairs to avoid repeats
  const recentPairs = new Set<string>();
  for (const [a, b] of recentMatchTeams) {
    recentPairs.add([a, b].sort().join("|"));
  }

  // Try all C(top8, 4) combinations — max C(8,4) = 70
  const combos = combinations(top8, 4);

  let bestState: PitstopState | null = null;
  let bestScore = -Infinity;

  for (const combo of combos) {
    // Bias toward lower queue indices (those waiting longest)
    // Each position beyond 0 subtracts a small amount
    const waitBias = combo.reduce((s, id) => {
      const pos = top8.indexOf(id);
      return s - pos * 1.5;
    }, 0);

    for (const [teamA, teamB] of teamSplits(combo)) {
      const s = scoreTeamSplit(teamA, teamB, members, mode, recentPairs) + waitBias;
      if (s > bestScore) {
        bestScore = s;
        const pairs: Record<string, "A" | "B"> = {};
        teamA.forEach((id) => (pairs[id] = "A"));
        teamB.forEach((id) => (pairs[id] = "B"));
        bestState = { players: combo, pairs };
      }
    }
  }

  return bestState;
}

// Extract recent same-team pairs from the last N matches
export function recentTeamPairs(
  matches: Array<{ team_a: [string, string]; team_b: [string, string]; result: string }>,
  last = 3,
): Array<[string, string]> {
  return matches
    .filter((m) => m.result !== "pending")
    .slice(-last)
    .flatMap((m) => [
      [m.team_a[0], m.team_a[1]] as [string, string],
      [m.team_b[0], m.team_b[1]] as [string, string],
    ]);
}
