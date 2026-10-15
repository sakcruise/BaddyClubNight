import { useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import { expensesApi } from "../../services/groups";
import { equalSplit, splitPenceByWeights, toPence, fromPence } from "../../utils/splits";
import type { GroupMember, GroupExpense, ExpenseCategory } from "../../types";
import type { CostSession } from "./AddCostsModal";

interface Props {
  expense: GroupExpense;
  members: GroupMember[];
  sessions: CostSession[];
  onSaved: () => void;
  onClose: () => void;
}

type SplitMode = "equal" | "percent" | "exact";
const money = (n: number) => `£${n.toFixed(2)}`;
const TYPE_DOT: Record<string, string> = { male: "bg-blue-500", female: "bg-pink-500", guest: "bg-purple-500" };
const CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: "court", label: "Court" },
  { key: "shuttles", label: "Shuttles" },
  { key: "other", label: "Other" },
];

/** More than a penny between the smallest and largest share = not an equal split. */
function isUneven(e: GroupExpense): boolean {
  const p = e.shares.map((s) => toPence(s.amount));
  return p.length > 1 && Math.max(...p) - Math.min(...p) > 1;
}

/** Change one saved cost: name, type, amount, payer, session and who it's split between. */
export default function EditCostModal({ expense, members, sessions, onSaved, onClose }: Props) {
  const [description, setDescription] = useState(expense.description);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [amount, setAmount] = useState(expense.amount.toFixed(2));
  const [payer, setPayer] = useState(expense.paid_by);
  const [sessionId, setSessionId] = useState(expense.session_id ?? "");
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set(expense.shares.map((s) => s.member_id)));
  // An uneven saved split opens in Exact £ with each person's amount, so nothing changes unless edited.
  const [mode, setMode] = useState<SplitMode>(isUneven(expense) ? "exact" : "equal");
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(expense.shares.map((s) => [s.member_id, s.amount.toFixed(2)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const totalPence = toPence(total);
  const people = members.filter((m) => splitIds.has(m.id));
  const num = (id: string) => parseFloat(custom[id] ?? "") || 0;

  // Each person's share in pence, or null while it doesn't add up yet.
  const shares = useMemo((): { member_id: string; amount: number }[] | null => {
    if (people.length === 0 || totalPence === 0) return null;
    if (mode === "equal") return equalSplit(total, people.map((p) => p.id));
    if (mode === "percent") {
      const sum = people.reduce((t, p) => t + num(p.id), 0);
      if (Math.abs(sum - 100) > 0.001) return null;
      const parts = splitPenceByWeights(totalPence, people.map((p) => ({ id: p.id, weight: num(p.id) })));
      return people.map((p) => ({ member_id: p.id, amount: fromPence(parts[p.id] ?? 0) }));
    }
    const list = people.map((p) => ({ member_id: p.id, amount: fromPence(toPence(num(p.id))) }));
    return list.reduce((t, s) => t + toPence(s.amount), 0) === totalPence ? list : null;
  }, [mode, custom, people, total, totalPence]);

  const leftover = useMemo(() => {
    if (mode === "percent") {
      const d = Math.round((100 - people.reduce((t, p) => t + num(p.id), 0)) * 100) / 100;
      return d === 0 ? null : d > 0 ? `${d}% left to assign` : `${-d}% too much`;
    }
    if (mode === "exact") {
      const d = totalPence - people.reduce((t, p) => t + toPence(num(p.id)), 0);
      return d === 0 ? null : d > 0 ? `${money(fromPence(d))} left to assign` : `${money(fromPence(-d))} too much`;
    }
    return null;
  }, [mode, custom, people, totalPence]);

  /** Switch mode, starting everyone on an even split so they only adjust. */
  function pickMode(m: SplitMode) {
    setMode(m);
    if (m === "equal" || people.length === 0) return;
    const even = splitPenceByWeights(m === "percent" ? 10000 : totalPence, people.map((p) => ({ id: p.id, weight: 1 })));
    const next: Record<string, string> = {};
    people.forEach((p) => { next[p.id] = m === "percent" ? String(even[p.id] / 100) : fromPence(even[p.id]).toFixed(2); });
    setCustom(next);
  }

  function toggle(id: string) {
    setSplitIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function save() {
    if (total <= 0) { setError("Enter an amount"); return; }
    if (!shares) { setError(mode === "percent" ? "Percentages must add up to 100%" : `Amounts must add up to ${money(total)}`); return; }
    setBusy(true);
    setError(null);
    try {
      await expensesApi.update(expense.id, {
        session_id: sessionId || undefined,
        category,
        description: description.trim() || CATEGORIES.find((c) => c.key === category)!.label,
        amount: total,
        paid_by: payer,
        shares: shares.filter((s) => s.amount > 0),
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-purple-400 transition-colors";
  const each = people.length ? total / people.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-display font-black text-gray-900 text-lg">Edit cost</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                className={`py-1.5 rounded-lg text-xs font-display font-black transition-all ${category === c.key ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"}`}>
                {c.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Name</span>
            <input id="edit-cost-name" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Amount</span>
              <input id="edit-cost-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Paid by</span>
              <select id="edit-cost-payer" value={payer} onChange={(e) => setPayer(e.target.value)} className={`${inputCls} py-2`}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Session</span>
            <select id="edit-cost-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={inputCls}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="">Not tied to a session</option>
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Split between · {people.length}</span>
              <div className="flex gap-2 text-xs font-display font-bold text-purple-600">
                <button type="button" onClick={() => setSplitIds(new Set(members.map((m) => m.id)))}>All</button>
                <button type="button" onClick={() => setSplitIds(new Set())}>None</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
              {(["equal", "percent", "exact"] as const).map((m) => (
                <button key={m} type="button" onClick={() => pickMode(m)}
                  className={`py-1.5 rounded-lg text-xs font-display font-black transition-all ${mode === m ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"}`}>
                  {m === "equal" ? "Equally" : m === "percent" ? "By %" : "Exact £"}
                </button>
              ))}
            </div>
            <div className="flex flex-col rounded-2xl border border-gray-100 overflow-hidden">
              {members.map((m) => {
                const on = splitIds.has(m.id);
                const pct = mode === "percent" && on && totalPence > 0 ? (total * num(m.id)) / 100 : null;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-0">
                    <button type="button" onClick={() => toggle(m.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? "bg-purple-500 border-purple-500 text-white" : "border-gray-300"}`}>
                        {on && <Check size={12} />}
                      </span>
                      <span className={`w-7 h-7 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-[11px] flex-shrink-0`}>
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{m.name}</span>
                    </button>
                    {on && mode === "equal" && each > 0 && <span className="text-xs font-display font-bold text-gray-400 tabular-nums">{money(each)}</span>}
                    {on && mode !== "equal" && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {pct !== null && <span className="text-[11px] font-display font-bold text-gray-400 tabular-nums">{money(pct)}</span>}
                        <div className="relative">
                          {mode === "exact" && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>}
                          <input
                            aria-label={`${m.name} ${mode === "percent" ? "percentage" : "amount"}`}
                            type="number" inputMode="decimal" min="0" step={mode === "percent" ? "1" : "0.01"}
                            value={custom[m.id] ?? ""}
                            onChange={(e) => setCustom((c) => ({ ...c, [m.id]: e.target.value }))}
                            className={`w-20 border-2 border-gray-200 rounded-lg py-1 text-sm text-right tabular-nums focus:outline-none focus:border-purple-400 ${mode === "exact" ? "pl-5 pr-2" : "pl-2 pr-6"}`}
                          />
                          {mode === "percent" && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {leftover && people.length > 0 && totalPence > 0 && (
              <p className="text-xs font-display font-bold text-orange-600 text-right">{leftover}</p>
            )}
          </div>
        </div>

        <div className="px-6 pt-3 pb-5 border-t border-gray-100 flex flex-col gap-2">
          {error && <p className="text-sm text-red-600 font-display font-bold">{error}</p>}
          <button onClick={save} disabled={busy || !shares}
            className="w-full py-3.5 rounded-2xl font-display font-black text-white bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all">
            {busy ? "Saving…" : `Save changes · ${money(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
