import { useEffect, useState } from "react";
import { Wallet, Plus, Check, X, Pencil, Trash2 } from "lucide-react";
import { plansApi } from "../../services/membership";
import { BILLING_PERIODS, billingPer } from "../../utils/billing";
import type { MembershipPlan, BillingPeriod } from "../../types";

const money = (n: number) => `£${n.toFixed(2)}`;
const inputCls =
  "border-2 border-gray-200 rounded-xl px-3 py-2 font-display font-bold text-sm bg-white w-full focus:outline-none focus:border-emerald-400";

interface Props {
  defaultCadence: BillingPeriod;
}

/** Membership tiers (Full / Student / Social…) — lives in Supabase, not ClubConfig. */
export default function MembershipPlansCard({ defaultCadence }: Props) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<MembershipPlan> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      let list = await plansApi.list();
      if (list.length === 0) list = await plansApi.seedDefaults(defaultCadence);
      setPlans(list);
    } catch (e: any) {
      setError(e?.message ?? "Could not load plans");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name?.trim() || editing.fee === undefined || isNaN(Number(editing.fee))) return;
    setBusy(true);
    try {
      const patch = { name: editing.name.trim(), fee: Number(editing.fee), cadence: editing.cadence ?? defaultCadence };
      if (editing.id) {
        const p = await plansApi.update(editing.id, patch);
        setPlans((ps) => ps.map((x) => (x.id === p.id ? p : x)));
      } else {
        const p = await plansApi.create({ ...patch, sort_order: plans.length });
        setPlans((ps) => [...ps, p]);
      }
      setEditing(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not save plan");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: MembershipPlan) {
    const u = await plansApi.update(p.id, { active: !p.active });
    setPlans((ps) => ps.map((x) => (x.id === u.id ? u : x)));
  }

  async function remove(p: MembershipPlan) {
    if (!confirm(`Delete the ${p.name} plan? Members on it will have no plan until you pick another.`)) return;
    await plansApi.delete(p.id);
    setPlans((ps) => ps.filter((x) => x.id !== p.id));
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-600">
          <Wallet size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Membership Plans</span>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing({ name: "", fee: 0, cadence: defaultCadence })}
            className="flex items-center gap-1 text-xs font-display font-bold text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50"
          >
            <Plus size={13} /> Plan
          </button>
        )}
      </div>

      {error && <p className="text-xs font-display font-bold text-red-600">{error}</p>}
      {loading && <p className="text-xs text-gray-400 font-display font-bold">Loading…</p>}

      <div className="space-y-2">
        {plans.map((p) =>
          editing?.id === p.id ? (
            <PlanForm key={p.id} value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
          ) : (
            <div key={p.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${p.active ? "bg-gray-50 border-gray-100" : "bg-white border-dashed border-gray-200 opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-sm text-gray-900 truncate">
                  {p.name}{!p.active && <span className="ml-2 text-[10px] uppercase text-gray-400">inactive</span>}
                </div>
                <div className="text-xs text-gray-500 font-display">{money(p.fee)} per {billingPer(p.cadence)}</div>
              </div>
              <button onClick={() => setEditing(p)} title="Edit" className="p-2 rounded-xl text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                <Pencil size={14} />
              </button>
              <button onClick={() => toggleActive(p)} title={p.active ? "Hide from new members" : "Reactivate"}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                {p.active ? <X size={14} /> : <Check size={14} />}
              </button>
              <button onClick={() => remove(p)} title="Delete" className="p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50">
                <Trash2 size={14} />
              </button>
            </div>
          )
        )}
        {editing && !editing.id && (
          <PlanForm value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
        )}
      </div>

      <p className="text-xs text-gray-400 font-body">
        Each member is on one plan; billing a period charges them that plan's fee. Paused members aren't billed.
      </p>
    </div>
  );
}

function PlanForm({ value, onChange, onSave, onCancel, busy }: {
  value: Partial<MembershipPlan>;
  onChange: (v: Partial<MembershipPlan>) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          placeholder="Plan name, e.g. Student"
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={inputCls}
        />
        <input
          type="number" min="0" step="0.50" placeholder="Fee (£)"
          value={value.fee ?? ""}
          onChange={(e) => onChange({ ...value, fee: e.target.value === "" ? undefined : Number(e.target.value) })}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {BILLING_PERIODS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange({ ...value, cadence: c.value })}
            className={`py-2 rounded-lg font-display font-bold text-[11px] border-2 transition-all
              ${value.cadence === c.value ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-display font-bold text-gray-500 hover:bg-gray-100">Cancel</button>
        <button onClick={onSave} disabled={busy || !value.name?.trim() || value.fee === undefined}
          className="px-3 py-1.5 rounded-lg text-xs font-display font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
