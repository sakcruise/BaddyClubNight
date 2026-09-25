import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserCheck, X } from "lucide-react";
import AdminPage from "../components/admin/AdminPage";
import Avatar from "../components/shared/Avatar";
import { money } from "../components/admin/PayRow";
import { guestsApi, plansApi, type GuestSummary } from "../services/membership";
import { paymentsApi } from "../services/payments";
import { useMemberStore, useSessionStore } from "../store";
import { billingWindows, proRata } from "../utils/billing";
import type { MembershipPlan, SessionFee } from "../types";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function GuestsView() {
  const navigate = useNavigate();
  const updateMember = useMemberStore((s) => s.updateMember);
  const clubConfig = useSessionStore((s) => s.clubConfig);
  const [guests, setGuests] = useState<GuestSummary[]>([]);
  const [fees, setFees] = useState<SessionFee[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [converting, setConverting] = useState<GuestSummary | null>(null);

  useEffect(() => {
    Promise.all([guestsApi.list(), paymentsApi.listSessionFees(), plansApi.list()]).then(([g, f, p]) => {
      setGuests(g);
      setFees(f);
      setPlans(p.filter((x) => x.active));
      setLoading(false);
    });
  }, []);

  const owedBy = useMemo(() => {
    const m = new Map<string, number>();
    fees.filter((f) => f.status === "unpaid").forEach((f) => m.set(f.member_id, (m.get(f.member_id) ?? 0) + f.amount_due));
    return m;
  }, [fees]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests
      .filter((g) => !q || g.member.name.toLowerCase().includes(q))
      .sort((a, b) => (b.last_visit ?? "").localeCompare(a.last_visit ?? "") || a.member.name.localeCompare(b.member.name));
  }, [guests, query]);

  const askToJoin = Number(clubConfig.guestVisitsBeforeJoin) || 0;

  return (
    <AdminPage title="Guests" subtitle={`${guests.length} have played · £${(Number(clubConfig.guestFee) || 0).toFixed(2)} a night`}>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 bg-white rounded-2xl border border-gray-200 px-3 py-2.5">
          <Search size={15} className="text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guests" className="flex-1 bg-transparent font-body text-sm focus:outline-none" />
        </label>

        {converting && (
          <ConvertCard
            guest={converting}
            plans={plans}
            onCancel={() => setConverting(null)}
            onDone={(m) => {
              updateMember(m.id, m);
              setGuests((gs) => gs.filter((g) => g.member.id !== m.id));
              setConverting(null);
              navigate(`/members/${m.id}`);
            }}
          />
        )}

        <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {loading && <p className="text-center text-sm text-gray-400 font-display font-bold py-10">Loading…</p>}
          {!loading && shown.length === 0 && (
            <p className="text-center text-sm text-gray-400 font-display font-bold py-10">
              {guests.length === 0 ? "No guests yet — add one from a club night's check-in" : "Nobody matches"}
            </p>
          )}
          {shown.map((g) => {
            const owed = owedBy.get(g.member.id) ?? 0;
            const nudge = askToJoin > 0 && g.visits >= askToJoin;
            return (
              <div key={g.member.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={g.member.name} memberType="guest" size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm text-gray-900 truncate">{g.member.name}</div>
                  <div className="text-[11px] text-gray-400 font-display">
                    {g.visits} visit{g.visits === 1 ? "" : "s"}{g.last_visit ? ` · last ${fmtDate(g.last_visit)}` : ""}
                    {nudge && <span className="ml-1.5 text-violet-600 font-bold">· time to join?</span>}
                  </div>
                </div>
                {owed > 0 && <span className="text-xs font-display font-black text-amber-600">{money(owed)} owed</span>}
                <button
                  onClick={() => setConverting(g)}
                  className="flex items-center gap-1 text-xs font-display font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg"
                >
                  <UserCheck size={13} /> Make member
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 font-display px-1">
          Night fees for guests are charged from Finance → Guests. Converting keeps every match they've played.
        </p>
      </div>
    </AdminPage>
  );
}

function ConvertCard({ guest, plans, onCancel, onDone }: {
  guest: GuestSummary; plans: MembershipPlan[]; onCancel: () => void; onDone: (m: GuestSummary["member"]) => void;
}) {
  const [gender, setGender] = useState<"male" | "female">("male");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [status, setStatus] = useState<"active" | "trial">("active");
  const [billing, setBilling] = useState<"full" | "pro_rata" | "none">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const plan = plans.find((p) => p.id === planId) ?? null;
  const today = todayISO();
  const window_ = plan ? billingWindows(plan.cadence, 0, 0).find((w) => w.current) ?? null : null;
  const amount = plan && window_ ? (billing === "full" ? plan.fee : billing === "pro_rata" ? proRata(plan.fee, window_, today) : 0) : 0;

  async function convert() {
    setBusy(true);
    setError("");
    try {
      const m = await guestsApi.convert(guest.member.id, { member_type: gender, plan_id: planId || null, status, joined_at: today });
      if (plan && window_ && billing !== "none" && amount > 0) {
        await paymentsApi.createPeriod({
          period_label: window_.label, period_start: window_.start, period_end: window_.end,
          amount_due: amount, member_ids: [m.id], plan_id: plan.id,
        });
      }
      onDone(m);
    } catch (e: any) {
      setError(e?.message ?? "Could not convert");
    } finally {
      setBusy(false);
    }
  }

  const input = "border-2 border-violet-200 rounded-xl px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-violet-400 w-full";
  const chip = (on: boolean) => `flex-1 py-2 rounded-xl border-2 text-xs font-display font-bold transition-all ${on ? "bg-violet-500 text-white border-violet-500" : "bg-white text-gray-500 border-gray-200"}`;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-3xl p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-display font-bold text-violet-700 uppercase tracking-wider">Make {guest.member.name} a member</p>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-violet-100"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex gap-2">
          <button onClick={() => setGender("male")} className={chip(gender === "male")}>♂ Male</button>
          <button onClick={() => setGender("female")} className={chip(gender === "female")}>♀ Female</button>
        </div>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={input}>
          {plans.length === 0 && <option value="">No plan</option>}
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.fee)}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={() => setStatus("active")} className={chip(status === "active")}>Member</button>
          <button onClick={() => setStatus("trial")} className={chip(status === "trial")}>Trial</button>
        </div>
      </div>
      {plan && window_ && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-display font-bold text-violet-700 uppercase tracking-wider">First period · {window_.label}</span>
          <div className="flex gap-2">
            <button onClick={() => setBilling("full")} className={chip(billing === "full")}>Full {money(plan.fee)}</button>
            <button onClick={() => setBilling("pro_rata")} className={chip(billing === "pro_rata")}>Pro-rata {money(proRata(plan.fee, window_, today))}</button>
            <button onClick={() => setBilling("none")} className={chip(billing === "none")}>Don't bill yet</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs font-display font-bold text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-display font-bold text-gray-500 hover:bg-violet-100">Cancel</button>
        <button onClick={convert} disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-display font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5">
          <UserCheck size={14} /> {busy ? "Converting…" : amount > 0 ? `Convert & bill ${money(amount)}` : "Convert"}
        </button>
      </div>
    </div>
  );
}
