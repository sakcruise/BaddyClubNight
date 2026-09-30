import { describe, it, expect } from "vitest";
import { equalSplit, computeBalances, simplifyDebts, splitPenceByWeights, allocateLines } from "./splits";
import type { GroupExpense, GroupSettlement } from "../types";

const expense = (paid_by: string, amount: number, shares: [string, number][]): GroupExpense => ({
  id: Math.random().toString(), category: "court", description: "", amount, paid_by,
  created_at: "", shares: shares.map(([member_id, amount]) => ({ member_id, amount })),
});

describe("equalSplit", () => {
  it("hands leftover pennies to the first people so it adds up exactly", () => {
    const s = equalSplit(10, ["a", "b", "c"]);
    expect(s.map((x) => x.amount)).toEqual([3.34, 3.33, 3.33]);
    expect(s.reduce((t, x) => t + Math.round(x.amount * 100), 0)).toBe(1000);
  });

  it("returns nothing for nobody", () => {
    expect(equalSplit(10, [])).toEqual([]);
  });
});

describe("computeBalances", () => {
  it("credits the payer and debits each share", () => {
    const b = computeBalances([expense("a", 12, [["a", 4], ["b", 4], ["c", 4]])], []);
    expect(b).toEqual({ a: 800, b: -400, c: -400 });
  });

  it("settlements move money back", () => {
    const settle: GroupSettlement = { id: "s", from_member: "b", to_member: "a", amount: 4, created_at: "" };
    const b = computeBalances([expense("a", 12, [["a", 4], ["b", 4], ["c", 4]])], [settle]);
    expect(b).toEqual({ a: 400, b: 0, c: -400 });
  });
});

describe("simplifyDebts", () => {
  it("court paid by one, shuttles by another → fewest payments", () => {
    const b = computeBalances([
      expense("a", 20, [["a", 5], ["b", 5], ["c", 5], ["d", 5]]),
      expense("b", 8, [["a", 2], ["b", 2], ["c", 2], ["d", 2]]),
    ], []);
    // a +13, b +1, c −7, d −7
    const t = simplifyDebts(b);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(14);
    expect(t.length).toBeLessThanOrEqual(3);
    const after = { ...b };
    t.forEach((x) => { after[x.from] += x.amount * 100; after[x.to] -= x.amount * 100; });
    Object.values(after).forEach((p) => expect(Math.round(p)).toBe(0));
  });
});

describe("splitPenceByWeights", () => {
  it("splits £42 as 50/30/20 exactly", () => {
    expect(splitPenceByWeights(4200, [{ id: "a", weight: 50 }, { id: "b", weight: 30 }, { id: "c", weight: 20 }]))
      .toEqual({ a: 2100, b: 1260, c: 840 });
  });

  it("thirds of £10 still add up to 1000p", () => {
    const s = splitPenceByWeights(1000, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }]);
    expect(Object.values(s).reduce((t, p) => t + p, 0)).toBe(1000);
    expect(Object.values(s).sort()).toEqual([333, 333, 334]);
  });
});

describe("allocateLines", () => {
  it("court + shuttles, custom totals: every line and every person adds up", () => {
    // £24 court + £18 shuttles = £42. Custom totals: a £20, b £12.50, c £9.50
    const targets = { a: 2000, b: 1250, c: 950 };
    const lines = allocateLines([2400, 1800], targets);
    lines.forEach((l, i) => expect(Object.values(l).reduce((t, p) => t + p, 0)).toBe([2400, 1800][i]));
    Object.entries(targets).forEach(([id, p]) => expect(lines[0][id] + lines[1][id]).toBe(p));
    lines.forEach((l) => Object.values(l).forEach((p) => expect(p).toBeGreaterThanOrEqual(0)));
  });

  it("someone paying 0 gets 0 on every line", () => {
    const lines = allocateLines([1000, 333, 7], { a: 1340, b: 0 });
    expect(lines.map((l) => l.b)).toEqual([0, 0, 0]);
  });
});
