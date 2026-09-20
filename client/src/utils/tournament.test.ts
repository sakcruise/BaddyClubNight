import { describe, it, expect } from "vitest";
import { selectQualifiers, type GroupStanding } from "./tournament";

function st(pair: [string, string], wins: number, losses: number, pointsFor: number): GroupStanding {
  return { pair, wins, losses, pointsFor, pointsAgainst: 0, pointDiff: pointsFor };
}

describe("selectQualifiers", () => {
  it("takes 2 per group across 4 groups = exactly 8, no fillers", () => {
    const sg: Record<number, GroupStanding[]> = {};
    for (let g = 0; g < 4; g++) sg[g] = [st([`g${g}a`, "x"], 3, 0, 33), st([`g${g}b`, "x"], 2, 1, 30), st([`g${g}c`, "x"], 1, 2, 20)];
    const { qualifiers, tiedForLast } = selectQualifiers(sg, 2);
    expect(qualifiers).toHaveLength(8);
    expect(tiedForLast).toBeNull();
    expect(qualifiers.every((q) => q.rankInGroup <= 2)).toBe(true);
  });

  it("with 3 groups fills to 8 with the best third-placers by avg then wins", () => {
    const sg: Record<number, GroupStanding[]> = {
      0: [st(["a1", "x"], 3, 0, 33), st(["a2", "x"], 2, 1, 30), st(["a3", "x"], 1, 2, 27)], // avg 9
      1: [st(["b1", "x"], 3, 0, 33), st(["b2", "x"], 2, 1, 30), st(["b3", "x"], 1, 2, 24)], // avg 8
      2: [st(["c1", "x"], 3, 0, 33), st(["c2", "x"], 2, 1, 30), st(["c3", "x"], 0, 3, 30)], // avg 10, 0 wins
    };
    const { qualifiers, tiedForLast } = selectQualifiers(sg, 2);
    expect(qualifiers).toHaveLength(8);
    expect(tiedForLast).toBeNull();
    const extras = qualifiers.filter((q) => q.rankInGroup === 3).map((q) => q.pair[0]);
    expect(extras).toEqual(["c3", "a3"]);
  });

  it("reports a dead heat for the last slot instead of guessing", () => {
    const sg: Record<number, GroupStanding[]> = {
      0: [st(["a1", "x"], 3, 0, 33), st(["a2", "x"], 2, 1, 30), st(["a3", "x"], 1, 2, 27)],
      1: [st(["b1", "x"], 3, 0, 33), st(["b2", "x"], 2, 1, 30), st(["b3", "x"], 1, 2, 27)],
      2: [st(["c1", "x"], 3, 0, 33), st(["c2", "x"], 2, 1, 30), st(["c3", "x"], 1, 2, 30)],
    };
    const { qualifiers, tiedForLast } = selectQualifiers(sg, 2);
    expect(qualifiers).toHaveLength(7);
    expect(qualifiers.some((q) => q.pair[0] === "c3")).toBe(true);
    expect(tiedForLast?.map((q) => q.pair[0]).sort()).toEqual(["a3", "b3"]);
  });
});
