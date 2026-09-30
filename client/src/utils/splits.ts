/**
 * Splitwise-style maths for friends groups. Everything works in whole pennies
 * so shares always add back up to the amount exactly.
 */
import type { GroupExpense, GroupSettlement } from "../types";

export const toPence = (n: number) => Math.round(n * 100);
export const fromPence = (p: number) => p / 100;

/**
 * Split an amount equally between people. Leftover pennies go one each to the
 * first people in the list, so £10 between 3 is 3.34 / 3.33 / 3.33.
 */
export function equalSplit(amount: number, memberIds: string[]): { member_id: string; amount: number }[] {
  if (memberIds.length === 0) return [];
  const total = toPence(amount);
  const base = Math.floor(total / memberIds.length);
  const extra = total - base * memberIds.length;
  return memberIds.map((member_id, i) => ({ member_id, amount: fromPence(base + (i < extra ? 1 : 0)) }));
}

/**
 * Split whole pence by weights (e.g. percentages) using largest remainder, so
 * the parts always add back up exactly. Ties go to the earlier entry.
 */
export function splitPenceByWeights(totalPence: number, weights: { id: string; weight: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  const sum = weights.reduce((t, w) => t + Math.max(0, w.weight), 0);
  if (sum <= 0 || weights.length === 0) return out;
  const raw = weights.map((w) => ({ id: w.id, exact: (totalPence * Math.max(0, w.weight)) / sum }));
  let given = 0;
  raw.forEach((r) => { out[r.id] = Math.floor(r.exact); given += out[r.id]; });
  raw
    .map((r, i) => ({ id: r.id, rem: r.exact - Math.floor(r.exact), i }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
    .slice(0, totalPence - given)
    .forEach((r) => { out[r.id] += 1; });
  return out;
}

/**
 * A session can have several costs (court, shuttles, …) but one split. Given
 * each person's total in pence, work out their share of every cost so that
 * each cost adds up to its amount AND each person's shares add up to their
 * total. Earlier costs are split in proportion to what people still owe; the
 * last cost takes exactly what's left, so nobody is ever a penny out.
 */
export function allocateLines(linePence: number[], targets: Record<string, number>): Record<string, number>[] {
  const remaining = { ...targets };
  return linePence.map((amount, idx) => {
    if (idx === linePence.length - 1) {
      const last = { ...remaining };
      Object.keys(remaining).forEach((k) => { remaining[k] = 0; });
      return last;
    }
    const part = splitPenceByWeights(amount, Object.entries(remaining).map(([id, weight]) => ({ id, weight })));
    Object.entries(part).forEach(([id, p]) => { remaining[id] -= p; });
    return part;
  });
}

/**
 * Net balance per member, in pence. Positive = the group owes them,
 * negative = they owe the group.
 */
export function computeBalances(expenses: GroupExpense[], settlements: GroupSettlement[]): Record<string, number> {
  const bal: Record<string, number> = {};
  const add = (id: string, p: number) => { bal[id] = (bal[id] ?? 0) + p; };
  for (const e of expenses) {
    add(e.paid_by, toPence(e.amount));
    for (const s of e.shares) add(s.member_id, -toPence(s.amount));
  }
  for (const s of settlements) {
    add(s.from_member, toPence(s.amount));
    add(s.to_member, -toPence(s.amount));
  }
  return bal;
}

export interface Transfer { from: string; to: string; amount: number }

/**
 * Fewest-payments plan to square everyone up: repeatedly match the biggest
 * debtor with the biggest creditor. Amounts returned in pounds.
 */
export function simplifyDebts(balances: Record<string, number>): Transfer[] {
  const debtors = Object.entries(balances).filter(([, p]) => p < 0).map(([id, p]) => ({ id, p: -p }));
  const creditors = Object.entries(balances).filter(([, p]) => p > 0).map(([id, p]) => ({ id, p }));
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.p - a.p);
    creditors.sort((a, b) => b.p - a.p);
    const d = debtors[0], c = creditors[0];
    const p = Math.min(d.p, c.p);
    out.push({ from: d.id, to: c.id, amount: fromPence(p) });
    d.p -= p; c.p -= p;
    if (d.p === 0) debtors.shift();
    if (c.p === 0) creditors.shift();
  }
  return out;
}
