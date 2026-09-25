import { describe, it, expect } from "vitest";
import { billingWindows, billingPer } from "./billing";

const sep2026 = new Date(2026, 8, 25);

describe("billingWindows", () => {
  it("quarterly: labels, bounds and the current flag", () => {
    const w = billingWindows("quarterly", 1, 1, sep2026);
    expect(w.map((x) => x.label)).toEqual(["2026 Q2", "2026 Q3", "2026 Q4"]);
    expect(w[1]).toMatchObject({ start: "2026-07-01", end: "2026-09-30", current: true });
    expect(w.filter((x) => x.current)).toHaveLength(1);
  });

  it("monthly: month names and last-day-of-month ends", () => {
    const w = billingWindows("monthly", 0, 1, new Date(2026, 1, 10));
    expect(w[0]).toMatchObject({ label: "Feb 2026", start: "2026-02-01", end: "2026-02-28" });
    expect(w[1]).toMatchObject({ label: "Mar 2026", end: "2026-03-31" });
  });

  it("half-yearly and yearly roll over the year boundary", () => {
    expect(billingWindows("half_yearly", 0, 1, sep2026).map((x) => x.label)).toEqual(["2026 H2", "2027 H1"]);
    expect(billingWindows("yearly", 1, 1, sep2026).map((x) => x.label)).toEqual(["2025", "2026", "2027"]);
    expect(billingWindows("yearly", 0, 0, sep2026)[0]).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("returns before + 1 + after windows in chronological order", () => {
    const w = billingWindows("quarterly", 2, 2, sep2026);
    expect(w).toHaveLength(5);
    for (let i = 1; i < w.length; i++) expect(w[i].start > w[i - 1].start).toBe(true);
  });
});

describe("billingPer", () => {
  it("names the unit for each cadence", () => {
    expect(billingPer("monthly")).toBe("month");
    expect(billingPer("quarterly")).toBe("quarter");
    expect(billingPer("half_yearly")).toBe("half year");
    expect(billingPer("yearly")).toBe("year");
  });
});
