import type { Member, MemberStatus } from "../types";

export const STATUS_META: Record<MemberStatus, { label: string; cls: string }> = {
  guest:    { label: "Guest",    cls: "bg-purple-100 text-purple-700 border-purple-300" },
  trial:    { label: "Trial",    cls: "bg-sky-100 text-sky-700 border-sky-300" },
  active:   { label: "Active",   cls: "bg-green-100 text-green-700 border-green-300" },
  paused:   { label: "Paused",   cls: "bg-amber-100 text-amber-700 border-amber-300" },
  lapsed:   { label: "Lapsed",   cls: "bg-red-100 text-red-700 border-red-300" },
  archived: { label: "Archived", cls: "bg-gray-100 text-gray-500 border-gray-300" },
};

/** Statuses that get billed when a plan's period is created. */
export const BILLABLE: ReadonlySet<MemberStatus> = new Set(["active", "trial"]);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The status a member should have today. A pause whose end date has passed
 * resumes as active; the caller persists the change if it differs.
 */
export function effectiveStatus(m: Member, today = todayISO()): MemberStatus {
  const s = m.status ?? (m.member_type === "guest" ? "guest" : m.active === false ? "archived" : "active");
  if (s === "paused" && m.paused_until && m.paused_until < today) return "active";
  return s;
}

/** Fields to persist when moving a member to a status (keeps the legacy `active` flag in step). */
export function statusPatch(status: MemberStatus, extra: Partial<Member> = {}): Partial<Member> {
  const clear = status !== "paused" ? { paused_from: null, paused_until: null, pause_reason: null } : {};
  return { status, active: status !== "archived", ...clear, ...extra };
}
