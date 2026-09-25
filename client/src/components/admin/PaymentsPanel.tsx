import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, Plus, WifiOff, Receipt, CalendarDays, Scale, AlertTriangle, Download } from "lucide-react";
import PayRow, { money, shortDate } from "./PayRow";
import { BILLABLE, effectiveStatus, statusPatch } from "../../utils/memberStatus";
import { toCsv, downloadCsv } from "../../utils/csv";
import { useMemberStore, usePaymentStore, useSessionStore } from "../../store";
import { membersApi } from "../../services/api";
import { paymentsApi, type PaymentSessionSummary } from "../../services/payments";
import { plansApi } from "../../services/membership";
import Avatar from "../shared/Avatar";
import type { Member, MembershipDue, SessionFee, PaymentStatus, PaidMethod, MembershipPlan } from "../../types";
import { billingWindows, billingPer } from "../../utils/billing";

type Tab = "dues" | "fees" | "ledger";


export default function PaymentsPanel() {
  const { members, setMembers } = useMemberStore();
  const { dues, sessionFees, setDues, upsertDues, setSessionFees, upsertSessionFees } = usePaymentStore();
  const clubConfig = useSessionStore((s) => s.clubConfig);

  const [tab, setTab] = useState<Tab>("dues");
  const [sessions, setSessions] = useState<PaymentSessionSummary[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const roster = useMemo(
    () =>
      Object.values(members)
        .filter((m) => m.member_type !== "guest" && BILLABLE.has(effectiveStatus(m)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [m, d, f, s, p] = await Promise.all([
        membersApi.list(),
        paymentsApi.listDues(),
        paymentsApi.listSessionFees(),
        paymentsApi.listRecentSessions(),
        plansApi.list(),
      ]);
      setMembers(m.members);
      setDues(d);
      setSessionFees(f);
      setSessions(s);
      setPlans(p);
    } catch (e: any) {
      setError(e?.message ?? "Could not load payments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!navigator.onLine) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <WifiOff size={28} className="text-gray-300" />
        <p className="font-display font-bold text-gray-500 text-sm">Payments needs an internet connection</p>
        <p className="text-xs text-gray-400 font-body">Dues and fees live in the cloud only, so the kiosk's offline mode can't show them.</p>
      </div>
    );
  }

  const dueList = Object.values(dues);
  const feeList = Object.values(sessionFees);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-black text-brand-900">Payments</h2>
        <span className="bg-emerald-100 text-emerald-700 text-xs font-display font-bold px-3 py-1 rounded-full">
          {money(outstanding(dueList) + outstanding(feeList))} outstanding
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1">
        {([
          ["dues", "Members", CalendarDays],
          ["fees", "Guests", Receipt],
          ["ledger", "Ledger", Scale],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-display font-bold transition-all
              ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs font-display font-bold text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {loading ? (
          <p className="text-center text-sm text-gray-400 font-display font-bold py-10">Loading…</p>
        ) : tab === "dues" ? (
          <DuesTab
            roster={roster}
            members={members}
            dues={dueList}
            plans={plans.filter((p) => p.active)}
            onChanged={upsertDues}
            reload={async () => setDues(await paymentsApi.listDues())}
          />
        ) : tab === "fees" ? (
          <FeesTab
            members={members}
            sessions={sessions}
            fees={feeList}
            defaultAmount={Number(clubConfig.guestFee) || 0}
            onChanged={upsertSessionFees}
            reload={async () => setSessionFees(await paymentsApi.listSessionFees())}
          />
        ) : (
          <LedgerTab members={members} dues={dueList} fees={feeList} plans={plans} />
        )}
      </div>
    </div>
  );
}

// ─── Membership dues ──────────────────────────────────────────────────────────

function DuesTab({ roster, members, dues, plans, onChanged, reload }: {
  roster: Member[];
  members: Record<string, Member>;
  dues: MembershipDue[];
  plans: MembershipPlan[];
  onChanged: (rows: MembershipDue[]) => void;
  reload: () => Promise<void>;
}) {
  const periods = useMemo(() => {
    const seen = new Map<string, MembershipDue>();
    for (const d of dues) if (!seen.has(d.period_label)) seen.set(d.period_label, d);
    return [...seen.values()].sort((a, b) => b.period_start.localeCompare(a.period_start));
  }, [dues]);

  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [planId, setPlanId] = useState("");
  const [windowLabel, setWindowLabel] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!plans.some((p) => p.id === planId)) setPlanId(plans[0]?.id ?? "");
  }, [plans, planId]);
  const plan = plans.find((p) => p.id === planId) ?? null;
  const billingPeriod = plan?.cadence ?? "quarterly";
  const onPlan = useMemo(() => roster.filter((m) => m.plan_id === planId), [roster, planId]);
  const unassigned = useMemo(() => roster.filter((m) => !m.plan_id), [roster]);

  // Windows from this plan's cadence that none of its members have been billed for yet
  const windows = useMemo(() => {
    const billed = new Set(dues.filter((d) => d.plan_id === planId).map((d) => d.period_label));
    return billingWindows(billingPeriod, 2, 2).filter((w) => !billed.has(w.label));
  }, [billingPeriod, dues, planId]);

  useEffect(() => {
    if (!windows.some((w) => w.label === windowLabel)) {
      setWindowLabel(windows.find((w) => w.current)?.label ?? windows[0]?.label ?? "");
    }
  }, [windows, windowLabel]);
  useEffect(() => { if (plan) setAmount(String(plan.fee)); }, [plan]);
  const window_ = windows.find((w) => w.label === windowLabel) ?? null;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (selected === null && periods.length) setSelected(periods[0].period_label);
  }, [periods, selected]);

  const period = periods.find((p) => p.period_label === selected) ?? null;
  const periodDues = dues.filter((d) => d.period_label === selected);
  const dueByMember = new Map(periodDues.map((d) => [d.member_id, d]));
  const unbilled = roster.filter((m) => !dueByMember.has(m.id));
  // Archived members with a due for this period still show, so history isn't hidden
  const billedArchived = periodDues
    .filter((d) => !roster.some((m) => m.id === d.member_id))
    .map((d) => members[d.member_id])
    .filter(Boolean) as Member[];

  const paidCount = periodDues.filter((d) => d.status === "paid").length;
  const collected = periodDues.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount_due, 0);

  async function setStatus(due: MembershipDue, status: PaymentStatus, method?: PaidMethod) {
    setBusyId(due.id);
    try {
      onChanged([await paymentsApi.setDueStatus(due.id, status, method)]);
    } finally {
      setBusyId(null);
    }
  }

  async function createPeriod() {
    const amt = parseFloat(amount);
    if (!window_ || !plan || isNaN(amt)) return;
    setCreating(true);
    try {
      await paymentsApi.createPeriod({
        period_label: window_.label,
        period_start: window_.start,
        period_end: window_.end,
        amount_due: amt,
        member_ids: onPlan.map((m) => m.id),
        plan_id: plan.id,
      });
      await reload();
      setSelected(window_.label);
      setShowNew(false);
    } finally {
      setCreating(false);
    }
  }

  async function billMember(m: Member) {
    if (!period) return;
    setBusyId(m.id);
    try {
      const mp = plans.find((p) => p.id === m.plan_id);
      await paymentsApi.createPeriod({
        period_label: period.period_label,
        period_start: period.period_start,
        period_end: period.period_end,
        amount_due: mp?.fee ?? period.amount_due,
        member_ids: [m.id],
        plan_id: mp?.id ?? null,
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function removeDue(due: MembershipDue) {
    setBusyId(due.id);
    try {
      await paymentsApi.deleteDue(due.id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Period selector + new period */}
      <div className="flex gap-2 items-center">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          disabled={periods.length === 0}
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 font-display font-bold text-sm bg-white
                     focus:outline-none focus:border-emerald-400 disabled:text-gray-400"
        >
          {periods.length === 0 && <option value="">No billing periods yet</option>}
          {periods.map((p) => (
            <option key={p.period_label} value={p.period_label}>
              {p.period_label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNew((v) => !v)}
          className={`px-3 py-2.5 rounded-xl font-display font-bold text-sm flex items-center gap-1 transition-all active:scale-95
            ${showNew ? "bg-gray-100 text-gray-600" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
        >
          {showNew ? <X size={15} /> : <><Plus size={15} /> Period</>}
        </button>
      </div>

      {showNew && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-xs font-display font-bold text-emerald-700 uppercase tracking-wider">
            Bill a plan for a {billingPer(billingPeriod)}
          </p>
          {plans.length === 0 ? (
            <p className="text-xs text-emerald-800 font-body">No membership plans yet — add them in Settings.</p>
          ) : windows.length === 0 ? (
            <p className="text-xs text-emerald-800 font-body">Every nearby {billingPer(billingPeriod)} is already billed for this plan.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Plan">
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Period">
                <select value={windowLabel} onChange={(e) => setWindowLabel(e.target.value)} className={inputCls}>
                  {windows.map((w) => (
                    <option key={w.label} value={w.label}>
                      {w.label}{w.current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Amount (£ / ${billingPer(billingPeriod)})`}>
                <input type="number" min="0" step="0.50" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          {window_ && (
            <p className="text-[11px] text-emerald-700 font-display">
              {shortDate(window_.start)} – {shortDate(window_.end)} · change the cadence in Club Settings
            </p>
          )}
          <button
            onClick={createPeriod}
            disabled={creating || !window_ || !plan || onPlan.length === 0 || isNaN(parseFloat(amount))}
            className="bg-emerald-500 text-white py-2.5 rounded-xl font-display font-bold text-sm hover:bg-emerald-600
                       active:scale-95 transition-all disabled:opacity-50"
          >
            {creating ? "Creating…" : `Bill ${onPlan.length} member${onPlan.length === 1 ? "" : "s"} on ${plan?.name ?? "plan"}`}
          </button>
          {unassigned.length > 0 && (
            <p className="text-[11px] text-amber-700 font-display">
              {unassigned.length} active member{unassigned.length === 1 ? " has" : "s have"} no plan yet — set one on their profile in Members.
            </p>
          )}
        </div>
      )}

      {period && (
        <div className="flex items-center justify-between text-xs font-display font-bold text-gray-500 px-1">
          <span>{shortDate(period.period_start)} – {shortDate(period.period_end)}</span>
          <span>{paidCount}/{periodDues.length} paid · {money(collected)} collected</span>
        </div>
      )}

      {/* Rows */}
      <div className="space-y-2">
        {period &&
          [...roster, ...billedArchived].map((m) => {
            const due = dueByMember.get(m.id);
            if (!due) {
              return (
                <div key={m.id} className="bg-white rounded-2xl border border-dashed border-gray-200 flex items-center gap-3 p-3 opacity-80">
                  <Avatar name={m.name} memberType={m.member_type} size="sm" />
                  <span className="flex-1 font-display font-bold text-sm text-gray-600 truncate">{m.name}</span>
                  <button
                    onClick={() => billMember(m)}
                    disabled={busyId === m.id}
                    className="text-xs font-display font-bold text-emerald-600 px-2 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-40 flex items-center gap-1"
                  >
                    <Plus size={12} /> Bill
                  </button>
                </div>
              );
            }
            return (
              <PayRow
                key={due.id}
                member={m}
                amount={due.amount_due}
                status={due.status}
                method={due.paid_method}
                paidAt={due.paid_at}
                busy={busyId === due.id}
                onSet={(s, meth) => setStatus(due, s, meth)}
                onRemove={due.status === "unpaid" ? () => removeDue(due) : undefined}
              />
            );
          })}

        {!period && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <span className="text-4xl">💷</span>
            <p className="text-gray-400 font-display font-bold text-sm">Bill a plan for a {billingPer(billingPeriod)} to start tracking dues</p>
          </div>
        )}
        {period && unbilled.length > 0 && periodDues.length > 0 && (
          <p className="text-[11px] text-gray-400 font-display text-center pt-1">
            {unbilled.length} member{unbilled.length === 1 ? "" : "s"} not billed for this period (joined later?) — tap Bill to add them
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Session fees ─────────────────────────────────────────────────────────────

function FeesTab({ members, sessions, fees, defaultAmount, onChanged, reload }: {
  members: Record<string, Member>;
  sessions: PaymentSessionSummary[];
  fees: SessionFee[];
  defaultAmount: number;
  onChanged: (rows: SessionFee[]) => void;
  reload: () => Promise<void>;
}) {
  const [sessionId, setSessionId] = useState<string>(sessions[0]?.id ?? "");
  const [amount, setAmount] = useState(String(defaultAmount));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sessionId && sessions.length) setSessionId(sessions[0].id);
  }, [sessions, sessionId]);

  const session = sessions.find((s) => s.id === sessionId);
  const sessionFees = fees
    .filter((f) => f.session_id === sessionId)
    .sort((a, b) => (members[a.member_id]?.name ?? "").localeCompare(members[b.member_id]?.name ?? ""));
  const paid = sessionFees.filter((f) => f.status === "paid");

  async function generate() {
    const amt = parseFloat(amount);
    if (!sessionId || isNaN(amt)) return;
    setGenerating(true);
    setMsg("");
    try {
      const ids = (await paymentsApi.listCheckedIn(sessionId)).filter((id) => members[id]?.member_type === "guest");
      const before = sessionFees.length;
      await paymentsApi.generateSessionFees(sessionId, ids, amt);
      await reload();
      const added = Math.max(0, ids.length - before);
      setMsg(ids.length === 0 ? "No guests played that night" : `Added ${added} fee${added === 1 ? "" : "s"} for ${ids.length} guest${ids.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      setMsg(e?.message ?? "Could not generate fees");
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(fee: SessionFee, status: PaymentStatus, method?: PaidMethod) {
    setBusyId(fee.id);
    try {
      onChanged([await paymentsApi.setSessionFeeStatus(fee.id, status, method)]);
    } finally {
      setBusyId(null);
    }
  }

  async function removeFee(fee: SessionFee) {
    setBusyId(fee.id);
    try {
      await paymentsApi.deleteSessionFee(fee.id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <select
        value={sessionId}
        onChange={(e) => { setSessionId(e.target.value); setMsg(""); }}
        disabled={sessions.length === 0}
        className="border-2 border-gray-200 rounded-xl px-3 py-2.5 font-display font-bold text-sm bg-white
                   focus:outline-none focus:border-emerald-400 disabled:text-gray-400"
      >
        {sessions.length === 0 && <option value="">No club nights yet</option>}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {shortDate(s.date)}{s.status === "active" ? " · live now" : ""}
          </option>
        ))}
      </select>

      {session && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex gap-2 items-end">
            <Field label="Guest fee (£ / night)">
              <input type="number" min="0" step="0.50" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </Field>
            <button
              onClick={generate}
              disabled={generating || isNaN(parseFloat(amount))}
              className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-display font-bold text-sm hover:bg-emerald-600
                         active:scale-95 transition-all disabled:opacity-50"
            >
              {generating ? "…" : sessionFees.length ? "Add newly checked-in guests" : "Charge guests who played"}
            </button>
          </div>
          {msg && <p className="text-xs font-display font-bold text-emerald-700">{msg}</p>}
        </div>
      )}

      {sessionFees.length > 0 && (
        <div className="flex items-center justify-between text-xs font-display font-bold text-gray-500 px-1">
          <span>{sessionFees.length} guest{sessionFees.length === 1 ? "" : "s"}</span>
          <span>{paid.length}/{sessionFees.length} paid · {money(paid.reduce((s, f) => s + f.amount_due, 0))} collected</span>
        </div>
      )}

      <div className="space-y-2">
        {sessionFees.map((fee) => {
          const m = members[fee.member_id];
          return (
            <PayRow
              key={fee.id}
              member={m ?? { id: fee.member_id, name: "Unknown player", member_type: "guest", level: 1, created_at: "" }}
              amount={fee.amount_due}
              status={fee.status}
              method={fee.paid_method}
              paidAt={fee.paid_at}
              busy={busyId === fee.id}
              onSet={(s, meth) => setStatus(fee, s, meth)}
              onRemove={fee.status === "unpaid" ? () => removeFee(fee) : undefined}
            />
          );
        })}
        {session && sessionFees.length === 0 && (
          <p className="text-center text-sm text-gray-400 font-display font-bold py-8">
            No guest fees for this night yet — charge the guests who played above
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

function LedgerTab({ members, dues, fees, plans }: { members: Record<string, Member>; dues: MembershipDue[]; fees: SessionFee[]; plans: MembershipPlan[] }) {
  const navigate = useNavigate();
  const updateMember = useMemberStore((s) => s.updateMember);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const acc = new Map<string, { owed: number; paid: number; unpaidItems: number; overdue: number }>();
    const add = (memberId: string, amount: number, status: PaymentStatus, overdue: boolean) => {
      const r = acc.get(memberId) ?? { owed: 0, paid: 0, unpaidItems: 0, overdue: 0 };
      if (status === "paid") r.paid += amount;
      if (status === "unpaid") { r.owed += amount; r.unpaidItems += 1; if (overdue) r.overdue += 1; }
      acc.set(memberId, r);
    };
    dues.forEach((d) => add(d.member_id, d.amount_due, d.status, d.period_end < today));
    fees.forEach((f) => add(f.member_id, f.amount_due, f.status, false));
    return [...acc.entries()]
      .map(([id, r]) => ({ member: members[id], ...r }))
      .filter((r) => r.member)
      .sort((a, b) => b.overdue - a.overdue || b.owed - a.owed || a.member.name.localeCompare(b.member.name));
  }, [members, dues, fees, today]);

  // Income by month, from paid_at
  const byMonth = useMemo(() => {
    const m = new Map<string, { dues: number; fees: number }>();
    const add = (paidAt: string | null, amt: number, kind: "dues" | "fees") => {
      if (!paidAt) return;
      const k = paidAt.slice(0, 7);
      const r = m.get(k) ?? { dues: 0, fees: 0 };
      r[kind] += amt;
      m.set(k, r);
    };
    dues.filter((d) => d.status === "paid").forEach((d) => add(d.paid_at, d.amount_due, "dues"));
    fees.filter((f) => f.status === "paid").forEach((f) => add(f.paid_at, f.amount_due, "fees"));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [dues, fees]);

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const overdueRows = rows.filter((r) => r.overdue > 0 && effectiveStatus(r.member) !== "lapsed");

  async function markLapsed(m: Member) {
    if (!confirm(`Mark ${m.name} as lapsed? They stay on the roster but won't be billed until reinstated.`)) return;
    setBusyId(m.id);
    try {
      const { member } = await membersApi.update(m.id, statusPatch("lapsed"));
      updateMember(m.id, member);
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const planName = (id?: string | null) => plans.find((p) => p.id === id)?.name ?? "";
    const csv = toCsv(
      ["Member", "Type", "Item", "Plan", "Amount", "Status", "Paid on", "Method", "Notes"],
      [
        ...dues.map((d) => [members[d.member_id]?.name ?? d.member_id, "Membership", d.period_label, planName(d.plan_id), d.amount_due.toFixed(2), d.status, d.paid_at?.slice(0, 10), d.paid_method, d.notes]),
        ...fees.map((f) => [members[f.member_id]?.name ?? f.member_id, "Night fee", f.created_at.slice(0, 10), "", f.amount_due.toFixed(2), f.status, f.paid_at?.slice(0, 10), f.paid_method, f.notes]),
      ]
    );
    downloadCsv(`payments-${today}.csv`, csv);
  }

  if (rows.length === 0) {
    return <p className="text-center text-sm text-gray-400 font-display font-bold py-10">Nothing recorded yet</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Outstanding" value={money(totalOwed)} tone="amber" />
        <Stat label="Collected" value={money(totalPaid)} tone="green" />
      </div>

      {overdueRows.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex flex-col gap-2">
          <p className="text-xs font-display font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={13} /> Overdue — {overdueRows.length} member{overdueRows.length === 1 ? "" : "s"} past a period end
          </p>
          {overdueRows.map(({ member, owed, overdue }) => (
            <div key={member.id} className="flex items-center gap-2 text-sm">
              <button onClick={() => navigate(`/members/${member.id}`)} className="flex-1 text-left font-display font-bold text-gray-900 truncate hover:underline">
                {member.name}
              </button>
              <span className="text-xs text-red-700 font-display">{overdue} overdue · {money(owed)}</span>
              <button onClick={() => markLapsed(member)} disabled={busyId === member.id}
                className="text-[11px] font-display font-bold text-red-700 bg-white border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 disabled:opacity-40">
                Mark lapsed
              </button>
            </div>
          ))}
        </div>
      )}

      {byMonth.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3">
          <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-2">Income by month</p>
          <div className="divide-y divide-gray-100">
            {byMonth.map(([month, r]) => (
              <div key={month} className="flex items-center justify-between py-1.5 text-xs font-display">
                <span className="font-bold text-gray-700">{new Date(month + "-15").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span>
                <span className="text-gray-400">{money(r.dues)} dues · {money(r.fees)} guests</span>
                <span className="font-black text-green-700">{money(r.dues + r.fees)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider">By member</p>
        <button onClick={exportCsv} className="flex items-center gap-1 text-xs font-display font-bold text-gray-600 hover:text-gray-900">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="space-y-2">
        {rows.map(({ member, owed, paid, unpaidItems }) => (
          <button key={member.id} onClick={() => navigate(`/members/${member.id}`)}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 text-left hover:border-gray-300">
            <Avatar name={member.name} memberType={member.member_type} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm text-gray-900 truncate">{member.name}</div>
              <div className="text-[11px] text-gray-400 font-display">
                {money(paid)} paid{unpaidItems ? ` · ${unpaidItems} unpaid item${unpaidItems === 1 ? "" : "s"}` : ""}
              </div>
            </div>
            <span className={`text-sm font-display font-black ${owed > 0 ? "text-amber-600" : "text-green-600"}`}>
              {owed > 0 ? money(owed) : "✓"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

const inputCls =
  "border-2 border-emerald-200 rounded-xl px-3 py-2 font-body text-sm bg-white w-full focus:outline-none focus:border-emerald-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 flex-1">
      <label className="text-[10px] font-display font-bold text-emerald-700 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "amber" | "green" }) {
  const cls = tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${cls}`}>
      <p className="text-[10px] font-display font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-display font-black">{value}</p>
    </div>
  );
}

function outstanding(rows: { amount_due: number; status: PaymentStatus }[]) {
  return rows.filter((r) => r.status === "unpaid").reduce((s, r) => s + r.amount_due, 0);
}
