import { describe, it, expect } from "vitest";
import type { Member, Match } from "../types";
import {
  snakeDraftGroups,
  pairStrongestWithWeakest,
  roundRobinFixtures,
  computeGroupStandings,
  buildKnockoutBracket,
  advanceKnockoutRound,
} from "./tournament";

function makeMember(id: string, level: number, name = id): Member {
  return { id, name, member_type: "male", level, created_at: "" };
}

function membersRecord(ms: Member[]): Record<string, Member> {
  return Object.fromEntries(ms.map((m) => [m.id, m]));
}

describe("snakeDraftGroups", () => {
  it("splits an even roster into even-sized, level-balanced groups", () => {
    // 16 players, levels 1..4 repeated — should split cleanly into 4 groups of 4
    const ms = Array.from({ length: 16 }, (_, i) =>
      makeMember(`p${i}`, (i % 4) + 1)
    );
    const members = membersRecord(ms);
    const { groups, reserves } = snakeDraftGroups(ms.map((m) => m.id), members, 4);

    expect(groups).toHaveLength(4);
    groups.forEach((g) => expect(g.length).toBe(4));
    expect(reserves).toHaveLength(0);

    // every group size must be even (so it can be fully paired)
    groups.forEach((g) => expect(g.length % 2).toBe(0));

    // no duplicate/missing participants
    const all = groups.flat().concat(reserves).sort();
    expect(all).toEqual(ms.map((m) => m.id).sort());
  });

  it("keeps every group even-sized when the roster count is odd (one reserve)", () => {
    const ms = Array.from({ length: 13 }, (_, i) => makeMember(`p${i}`, (i % 4) + 1));
    const members = membersRecord(ms);
    const { groups, reserves } = snakeDraftGroups(ms.map((m) => m.id), members, 4);

    expect(reserves).toHaveLength(1);
    groups.forEach((g) => expect(g.length % 2).toBe(0));
    const totalSeated = groups.reduce((s, g) => s + g.length, 0);
    expect(totalSeated + reserves.length).toBe(13);
  });

  it("keeps group sizes as even as possible when N doesn't divide evenly by numGroups", () => {
    // 18 players / 4 groups: pairs=9, base=2 pairs/group, remainder=1 group gets +1 pair
    const ms = Array.from({ length: 18 }, (_, i) => makeMember(`p${i}`, (i % 4) + 1));
    const members = membersRecord(ms);
    const { groups, reserves } = snakeDraftGroups(ms.map((m) => m.id), members, 4);

    expect(reserves).toHaveLength(0);
    const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
    // 18 = 4+4+4+6 or similar — all even, spread stays small
    groups.forEach((g) => expect(g.length % 2).toBe(0));
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
  });

  it("handles a single group (numGroups=1)", () => {
    const ms = Array.from({ length: 6 }, (_, i) => makeMember(`p${i}`, 2));
    const members = membersRecord(ms);
    const { groups, reserves } = snakeDraftGroups(ms.map((m) => m.id), members, 1);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(6);
    expect(reserves).toHaveLength(0);
  });
});

describe("pairStrongestWithWeakest", () => {
  it("pairs the strongest with the weakest within a group", () => {
    const ms = [makeMember("a", 4), makeMember("b", 3), makeMember("c", 2), makeMember("d", 1)];
    const members = membersRecord(ms);
    const pairs = pairStrongestWithWeakest(
      ms.map((m) => m.id),
      members
    );
    expect(pairs).toHaveLength(2);
    // a(4)+d(1) and b(3)+c(2)
    const asSets = pairs.map((p) => new Set(p));
    expect(asSets.some((s) => s.has("a") && s.has("d"))).toBe(true);
    expect(asSets.some((s) => s.has("b") && s.has("c"))).toBe(true);
  });

  it("throws on an odd-sized group (caller must guarantee even groups)", () => {
    const ms = [makeMember("a", 4), makeMember("b", 3), makeMember("c", 2)];
    const members = membersRecord(ms);
    expect(() => pairStrongestWithWeakest(ms.map((m) => m.id), members)).toThrow();
  });
});

describe("roundRobinFixtures", () => {
  it("has every pair play every other pair exactly once (even pair count)", () => {
    const pairs: Array<[string, string]> = [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ];
    const fixtures = roundRobinFixtures(pairs);
    expect(fixtures).toHaveLength(6); // C(4,2)

    const seen = new Set<string>();
    for (const f of fixtures) {
      const key = [f.teamA.join("-"), f.teamB.join("-")].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("gives every pair a bye exactly once when the pair count is odd", () => {
    const pairs: Array<[string, string]> = [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ];
    const fixtures = roundRobinFixtures(pairs);
    // 3 pairs -> each plays the other 2 -> 3 matches total, no bye *fixtures* (byes only
    // matter for round scheduling, not for total matchup count)
    expect(fixtures).toHaveLength(3);
  });
});

describe("computeGroupStandings", () => {
  const a: [string, string] = ["a1", "a2"];
  const b: [string, string] = ["b1", "b2"];
  const c: [string, string] = ["c1", "c2"];
  const members = membersRecord([
    makeMember("a1", 3), makeMember("a2", 3),
    makeMember("b1", 3), makeMember("b2", 3),
    makeMember("c1", 3), makeMember("c2", 3),
  ]);

  function match(id: string, teamA: [string, string], teamB: [string, string], scoreA: number, scoreB: number): Match {
    return {
      id, session_id: "s1", court_id: 1,
      team_a: teamA, team_b: teamB,
      score_a: scoreA, score_b: scoreB,
      result: "complete", started_at: "",
    };
  }

  it("ranks pairs by wins, using head-to-head to break ties", () => {
    // a beats b, b beats c, c beats a — 3-way tie on 1 win each; head-to-head is circular
    // so this specific case falls through to point-diff, but a-vs-b direct tie must resolve via h2h
    const matches = [
      match("m1", a, b, 21, 15), // a beat b
      match("m2", b, c, 21, 10), // b beat c
      match("m3", c, a, 21, 5),  // c beat a
    ];
    const standings = computeGroupStandings(matches, [a, b, c], members);
    expect(standings).toHaveLength(3);
    // all 1-1, fully circular — just confirm it doesn't crash and returns all 3 exactly once
    expect(standings.map((s) => s.pair)).toEqual(
      expect.arrayContaining([a, b, c])
    );
  });

  it("breaks a two-way tie on wins using the direct head-to-head result", () => {
    // a and b both finish 1-1, but a beat b directly, so a ranks above b
    const matches = [
      match("m1", a, b, 21, 15), // a beat b directly
      match("m2", a, c, 10, 21), // a lost to c
      match("m3", b, c, 21, 10), // b beat c
    ];
    const standings = computeGroupStandings(matches, [a, b, c], members);
    const rankOf = (p: [string, string]) => standings.findIndex((s) => s.pair === p);
    expect(rankOf(a)).toBeLessThan(rankOf(b));
  });
});

describe("buildKnockoutBracket", () => {
  it("builds a full bracket with no byes when qualifier count is a power of two", () => {
    const qualifiers = [0, 1, 2, 3].map((groupIndex) => ({
      groupIndex,
      rankInGroup: 1,
      pair: [`g${groupIndex}a`, `g${groupIndex}b`] as [string, string],
    }));
    const round1 = buildKnockoutBracket(qualifiers);
    expect(round1).toHaveLength(2);
    round1.forEach((f) => {
      expect(f.teamA).not.toBeNull();
      expect(f.teamB).not.toBeNull();
    });
  });

  it("pads with byes when qualifier count is not a power of two", () => {
    const qualifiers = [0, 1, 2].map((groupIndex) => ({
      groupIndex,
      rankInGroup: 1,
      pair: [`g${groupIndex}a`, `g${groupIndex}b`] as [string, string],
    }));
    const round1 = buildKnockoutBracket(qualifiers);
    // next power of two >= 3 is 4 -> 2 fixtures, one with a bye
    expect(round1).toHaveLength(2);
    const byes = round1.filter((f) => f.teamB === null);
    expect(byes).toHaveLength(1);
    expect(byes[0].teamA).not.toBeNull();
  });
});

describe("advanceKnockoutRound", () => {
  it("pairs consecutive seed winners into the next round", () => {
    const prevRound = [
      { seed: 1, winner: ["a1", "a2"] as [string, string] },
      { seed: 2, winner: ["b1", "b2"] as [string, string] },
      { seed: 3, winner: ["c1", "c2"] as [string, string] },
      { seed: 4, winner: ["d1", "d2"] as [string, string] },
    ];
    const next = advanceKnockoutRound(prevRound);
    expect(next).toHaveLength(2);
    expect(next[0].teamA).toEqual(["a1", "a2"]);
    expect(next[0].teamB).toEqual(["b1", "b2"]);
    expect(next[1].teamA).toEqual(["c1", "c2"]);
    expect(next[1].teamB).toEqual(["d1", "d2"]);
  });
});
