import type { BillingPeriod } from "../types";

export const BILLING_PERIODS: { value: BillingPeriod; label: string; per: string }[] = [
  { value: "monthly",     label: "Monthly",     per: "month" },
  { value: "quarterly",   label: "Quarterly",   per: "quarter" },
  { value: "half_yearly", label: "Half-yearly", per: "half year" },
  { value: "yearly",      label: "Yearly",      per: "year" },
];

export const billingPer = (kind: BillingPeriod) =>
  BILLING_PERIODS.find((p) => p.value === kind)?.per ?? "period";

const MONTHS_PER: Record<BillingPeriod, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BillingWindow {
  label: string;  // e.g. "2026 Q3", "Sep 2026", "2026 H2", "2026"
  start: string;  // ISO date
  end: string;    // ISO date, inclusive
  current: boolean;
}

// Local-date ISO — toISOString() would shift the day near midnight in non-UTC zones
const iso = (y: number, m: number, d: number) =>
  `${new Date(y, m, d).getFullYear()}-${String(new Date(y, m, d).getMonth() + 1).padStart(2, "0")}-${String(new Date(y, m, d).getDate()).padStart(2, "0")}`;

function label(kind: BillingPeriod, y: number, m: number): string {
  switch (kind) {
    case "monthly":     return `${MONTH_SHORT[m]} ${y}`;
    case "quarterly":   return `${y} Q${m / 3 + 1}`;
    case "half_yearly": return `${y} H${m / 6 + 1}`;
    case "yearly":      return `${y}`;
  }
}

/** Billing windows around today: `before` past ones, the current one, and `after` upcoming ones. */
export function billingWindows(kind: BillingPeriod, before = 2, after = 2, now = new Date()): BillingWindow[] {
  const n = MONTHS_PER[kind];
  const currentAbs = now.getFullYear() * 12 + Math.floor(now.getMonth() / n) * n;
  const out: BillingWindow[] = [];
  for (let i = -before; i <= after; i++) {
    const abs = currentAbs + i * n;
    const y = Math.floor(abs / 12);
    const m = abs % 12;
    out.push({
      label: label(kind, y, m),
      start: iso(y, m, 1),
      end: iso(y, m + n, 0),
      current: i === 0,
    });
  }
  return out;
}
