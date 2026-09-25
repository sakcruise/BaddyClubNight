import { describe, it, expect } from "vitest";
import { effectiveStatus, statusPatch, BILLABLE } from "./memberStatus";
import type { Member } from "../types";

const base: Member = { id: "1", name: "A", member_type: "male", level: 2, created_at: "" };

describe("effectiveStatus", () => {
  it("falls back from legacy fields when status is missing", () => {
    expect(effectiveStatus({ ...base })).toBe("active");
    expect(effectiveStatus({ ...base, active: false })).toBe("archived");
    expect(effectiveStatus({ ...base, member_type: "guest" })).toBe("guest");
  });

  it("keeps a pause that is still running", () => {
    expect(effectiveStatus({ ...base, status: "paused", paused_until: "2026-12-01" }, "2026-09-25")).toBe("paused");
  });

  it("resumes a pause whose end date has passed", () => {
    expect(effectiveStatus({ ...base, status: "paused", paused_until: "2026-09-01" }, "2026-09-25")).toBe("active");
  });

  it("keeps an open-ended pause", () => {
    expect(effectiveStatus({ ...base, status: "paused", paused_until: null }, "2026-09-25")).toBe("paused");
  });
});

describe("statusPatch", () => {
  it("archiving clears the legacy active flag and any pause", () => {
    expect(statusPatch("archived")).toMatchObject({ status: "archived", active: false, paused_until: null });
  });
  it("pausing keeps the pause window", () => {
    const p = statusPatch("paused", { paused_from: "2026-10-01", paused_until: "2026-11-01", pause_reason: "knee" });
    expect(p).toMatchObject({ status: "paused", active: true, paused_until: "2026-11-01", pause_reason: "knee" });
  });
});

it("only active and trial members are billable", () => {
  expect([...BILLABLE].sort()).toEqual(["active", "trial"]);
});
