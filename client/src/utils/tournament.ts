import type { Member, Match } from "../types";
import { computeLeaderboard } from "./scoring";

const lvl = (id: string, members: Record<string, Member>) => members[id]?.level ?? 2;

function byStrength(members: Record<string, Member>) {
  return (aId: string, bId: string) => {
    const diff = lvl(bId, members) - lvl(aId, members);
    if (diff !== 0) return diff;
    const nameA = members[aId]?.name ?? aId;
    const nameB = members[bId]?.name ?? bId;
    return nameA === nameB ? aId.localeCompare(bId) : nameA.localeCompare(nameB);
  };
}

/** Whole-roster strength order (strongest first) — the same ranking snakeDraftGroups
 * and pairStrongestWithWeakest use internally, exposed so callers can persist a
 * stable `seed` per participant. */
export function rankParticipants(participantIds: string[], members: Record<string, Member>): string[] {
  return [...participantIds].sort(byStrength(members));
}

/**
 * Snake-draft the roster into `numGroups` level-balanced groups, keeping every
 * group EVEN-sized so it can be fully paired into doubles later. Any leftover
 * (when the roster count is odd) comes back as a single reserve.
 */
export function snakeDraftGroups(
  participantIds: string[],
  members: Record<string, Member>,
  numGroups: number
): { groups: string[][]; reserves: string[] } {
  if (numGroups < 1) throw new Error("numGroups must be at least 1");

  const sorted = [...participantIds].sort(byStrength(members));
  const reserves: string[] = [];
  if (sorted.length % 2 === 1) {
    // Odd overall — the single weakest participant sits out as a reserve so
    // every group can still be built from an even-sized remaining pool.
    reserves.push(sorted.pop()!);
  }

  const n = sorted.length; // even
  const pairsTotal = n / 2;
  const basePairs = Math.floor(pairsTotal / numGroups);
  const remGroups = pairsTotal % numGroups; // this many groups get one extra pair
  const targetSizes = Array.from({ length: numGroups }, (_, g) => (basePairs + (g < remGroups ? 1 : 0)) * 2);

  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  let round = 0;
  let i = 0;
  while (i < n) {
    const order = round % 2 === 0
      ? Array.from({ length: numGroups }, (_, g) => g)
      : Array.from({ length: numGroups }, (_, g) => numGroups - 1 - g);
    for (const g of order) {
      if (i >= n) break;
      if (groups[g].length < targetSizes[g]) {
        groups[g].push(sorted[i]);
        i++;
      }
    }
    round++;
    // Safety valve: if every group is already at its target but people remain
    // (shouldn't happen since targetSizes sum to n), bail rather than loop forever.
    if (groups.every((g, idx) => g.length >= targetSizes[idx])) break;
  }

  return { groups, reserves };
}

/**
 * Within one (even-sized) group, pair strongest with weakest: 1st & last,
 * 2nd & 2nd-last, and so on — the same method used for the spreadsheet draft.
 */
export function pairStrongestWithWeakest(
  groupMemberIds: string[],
  members: Record<string, Member>
): Array<[string, string]> {
  if (groupMemberIds.length % 2 !== 0) {
    throw new Error("pairStrongestWithWeakest requires an even-sized group");
  }
  const sorted = [...groupMemberIds].sort(byStrength(members));
  const pairs: Array<[string, string]> = [];
  let i = 0;
  let j = sorted.length - 1;
  while (i < j) {
    pairs.push([sorted[i], sorted[j]]);
    i++;
    j--;
  }
  return pairs;
}

/**
 * Round-robin fixtures — every pair plays every other pair in the group once.
 * Uses the standard circle method so `round` numbers are ready to schedule.
 */
export function roundRobinFixtures(
  pairs: Array<[string, string]>
): Array<{ round: number; teamA: [string, string]; teamB: [string, string] }> {
  const n = pairs.length;
  if (n < 2) return [];

  const BYE = null as unknown as [string, string];
  const list = [...pairs];
  const odd = n % 2 === 1;
  if (odd) list.push(BYE);

  const size = list.length;
  const rounds = size - 1;
  const fixtures: Array<{ round: number; teamA: [string, string]; teamB: [string, string] }> = [];

  const arr = [...list];
  for (let r = 0; r < rounds; r++) {
    for (let k = 0; k < size / 2; k++) {
      const a = arr[k];
      const b = arr[size - 1 - k];
      if (a !== BYE && b !== BYE) {
        fixtures.push({ round: r + 1, teamA: a, teamB: b });
      }
    }
    // Rotate all but the first element (standard circle method).
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return fixtures;
}

export interface GroupStanding {
  pair: [string, string];
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

/**
 * Rank a group's pairs from its completed matches. Both members of a pair
 * always play together, so their per-player stats (via the existing
 * computeLeaderboard) are identical — one representative per pair is enough.
 * Ties on wins are broken by the direct head-to-head result between the tied
 * pairs, then by point differential as a last resort.
 */
export function computeGroupStandings(
  groupMatches: Match[],
  pairs: Array<[string, string]>,
  members: Record<string, Member>
): GroupStanding[] {
  const leaderboard = computeLeaderboard(groupMatches, members);
  const statsByPlayer = new Map(leaderboard.map((s) => [s.member_id, s]));

  const standings: GroupStanding[] = pairs.map((pair) => {
    const s = statsByPlayer.get(pair[0]) ?? statsByPlayer.get(pair[1]);
    return {
      pair,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      pointsFor: s?.points_for ?? 0,
      pointsAgainst: s?.points_against ?? 0,
      pointDiff: (s?.points_for ?? 0) - (s?.points_against ?? 0),
    };
  });

  const headToHead = (a: [string, string], b: [string, string]): number => {
    // +1 if a beat b directly, -1 if b beat a, 0 if no direct completed match.
    for (const m of groupMatches) {
      if (m.result !== "complete" || m.score_a == null || m.score_b == null) continue;
      const isAvB = m.team_a[0] === a[0] && m.team_b[0] === b[0];
      const isBvA = m.team_a[0] === b[0] && m.team_b[0] === a[0];
      if (isAvB) return m.score_a >= m.score_b ? 1 : -1;
      if (isBvA) return m.score_b >= m.score_a ? 1 : -1;
    }
    return 0;
  };

  return standings.sort((x, y) => {
    if (x.wins !== y.wins) return y.wins - x.wins;
    const h2h = headToHead(x.pair, y.pair);
    if (h2h !== 0) return -h2h; // h2h>0 means x beat y, so x should sort first
    return y.pointDiff - x.pointDiff;
  });
}

export interface KnockoutQualifier {
  groupIndex: number;
  rankInGroup: number; // 1 = group winner
  pair: [string, string];
}

export interface KnockoutFixture {
  round: number;
  seed: number;
  teamA: [string, string] | null;
  teamB: [string, string] | null; // null = bye, teamA auto-advances
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Seed round-1 knockout fixtures from group qualifiers: best rank first, top
 * seed plays bottom seed. Pads to the next power of two with byes (the bye
 * goes to the strongest unmatched seeds, so top seeds skip round 1).
 */
export function buildKnockoutBracket(qualifiers: KnockoutQualifier[]): KnockoutFixture[] {
  if (qualifiers.length === 0) return [];

  const ordered = [...qualifiers].sort(
    (a, b) => a.rankInGroup - b.rankInGroup || a.groupIndex - b.groupIndex
  );
  const bracketSize = nextPowerOfTwo(ordered.length);
  const slots: Array<[string, string] | null> = Array.from({ length: bracketSize }, (_, i) =>
    i < ordered.length ? ordered[i].pair : null
  );

  const fixtures: KnockoutFixture[] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const teamA = slots[i];
    const teamB = slots[bracketSize - 1 - i];
    // A genuinely empty slot (more byes than entrants, e.g. bracketSize=4 but only 1
    // qualifier) can only happen if teamA is also null — guard defensively.
    fixtures.push({ round: 1, seed: i + 1, teamA: teamA ?? teamB, teamB: teamA ? teamB : null });
  }
  return fixtures;
}

/**
 * Given the previous knockout round's winners (by seed), pair seed 1&2, 3&4,
 * ... into the next round.
 */
export function advanceKnockoutRound(
  previousRound: Array<{ seed: number; winner: [string, string] }>
): KnockoutFixture[] {
  const bySeed = [...previousRound].sort((a, b) => a.seed - b.seed);
  const next: KnockoutFixture[] = [];
  for (let i = 0; i < bySeed.length; i += 2) {
    const a = bySeed[i];
    const b = bySeed[i + 1];
    next.push({
      round: 0, // caller stamps the actual round number when persisting
      seed: i / 2 + 1,
      teamA: a.winner,
      teamB: b ? b.winner : null,
    });
  }
  return next;
}
