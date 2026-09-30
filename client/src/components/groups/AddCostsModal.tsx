import { useEffect, useMemo, useState } from "react";
import { X, LayoutGrid, Feather, Receipt, Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { expensesApi } from "../../services/groups";
import { useSessionStore } from "../../store";
import { equalSplit, splitPenceByWeights, allocateLines, toPence, fromPence } from "../../utils/splits";
import type { GroupMember, ExpenseCategory } from "../../types";

export interface CostSession { id: string; label: string }

interface Props {
  groupId: string;
  members: GroupMember[];
  sessions: CostSession[];          // newest first
  defaultSessionId?: string;
  defaultPayerId?: string | null;
  onSaved: () => void;
  onClose: () => void;
}

const money = (n: number) => `£${n.toFixed(2)}`;
type SplitMode = "equal" | "percent" | "exact";
interface CourtLine { key: number; label: string; amount: string; payer: string }
const MODES: { key: SplitMode; label: string }[] = [
  { key: "equal", label: "Equally" },
  { key: "percent", label: "By %" },
  { key: "exact", label: "Exact £" },
];
const TYPE_DOT: Record<string, string> = { male: "bg-blue-500", female: "bg-pink-500", guest: "bg-purple-500" };

/**
 * Court + shuttles for a session (or a one-off cost), each with its own payer,
 * split between the people who checked in — equally, by percentage, or by exact
 * amounts. The split covers the session total; each saved cost gets its share
 * of it. Saves one expense per line.
 */
export default function AddCostsModal({ groupId, members, sessions, defaultSessionId, defaultPayerId, onSaved, onClose }: Props) {
  const tubePrice = useSessionStore((s) => s.clubConfig?.shuttleTubePrice ?? 0);
  const firstPayer = defaultPayerId ?? members[0]?.id ?? "";

  const [sessionId, setSessionId] = useState<string>(defaultSessionId ?? sessions[0]?.id ?? "");
  // Several court bookings can go on one session (two courts, a booking fee…),
  // each with its own amount and payer. Each becomes its own court expense.
  const [courts, setCourts] = useState<CourtLine[]>([{ key: 1, label: "", amount: "", payer: firstPayer }]);
  const updateCourt = (key: number, patch: Partial<CourtLine>) =>
    setCourts((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addCourt = () =>
    setCourts((cs) => [...cs, { key: Math.max(...cs.map((c) => c.key)) + 1, label: "", amount: "", payer: cs[cs.length - 1]?.payer ?? firstPayer }]);
  const removeCourt = (key: number) => setCourts((cs) => cs.filter((c) => c.key !== key));
  const [shuttles, setShuttles] = useState("");
  const [shuttlePayer, setShuttlePayer] = useState(firstPayer);
  const [other, setOther] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [otherPayer, setOtherPayer] = useState(firstPayer);
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SplitMode>("equal");
  const [custom, setCustom] = useState<Record<string, string>>({}); // % or £ per person
  const [tubesUsed, setTubesUsed] = useState(0);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the split to whoever checked in / played at the chosen session.
  useEffect(() => {
    if (!sessionId) { setSplitIds(new Set()); setTubesUsed(0); return; }
    let cancelled = false;
    setLoadingPeople(true);
    Promise.all([
      expensesApi.attendees(sessionId).catch(() => [] as string[]),
      supabase.from("matches").select("shuttles_used").eq("session_id", sessionId)
        .then(({ data }) => (data ?? []).reduce((t: number, m: any) => t + (m.shuttles_used ?? 0), 0)),
    ]).then(([ids, tubes]) => {
      if (cancelled) return;
      setSplitIds(new Set(ids));
      setTubesUsed(tubes);
    }).finally(() => { if (!cancelled) setLoadingPeople(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const lines = useMemo(() => {
    const l: { category: ExpenseCategory; description: string; amount: number; paid_by: string }[] = [];
    const pence = (v: string) => Math.round((parseFloat(v) || 0) * 100) / 100;
    const s = pence(shuttles), o = pence(other);
    courts.forEach((c, i) => {
      const amount = pence(c.amount);
      const description = c.label.trim() || (courts.length > 1 ? `Court ${i + 1}` : "Court hire");
      if (amount > 0) l.push({ category: "court", description, amount, paid_by: c.payer });
    });
    if (s > 0) l.push({ category: "shuttles", description: "Shuttles", amount: s, paid_by: shuttlePayer });
    if (o > 0) l.push({ category: "other", description: otherLabel.trim() || "Other", amount: o, paid_by: otherPayer });
    return l;
  }, [courts, shuttles, other, otherLabel, shuttlePayer, otherPayer]);

  const total = lines.reduce((t, l) => t + l.amount, 0);
  const people = members.filter((m) => splitIds.has(m.id));
  const each = people.length ? total / people.length : 0;
  const totalPence = toPence(total);
  const num = (id: string) => parseFloat(custom[id] ?? "") || 0;

  // Each person's share of the whole session in pence, or null while the
  // percentages / amounts don't add up yet.
  const targets = useMemo((): Record<string, number> | null => {
    if (people.length === 0 || totalPence === 0) return null;
    if (mode === "equal") return null; // equal split is done per line (see save)
    if (mode === "percent") {
      const sum = people.reduce((t, p) => t + num(p.id), 0);
      if (Math.abs(sum - 100) > 0.001) return null;
      return splitPenceByWeights(totalPence, people.map((p) => ({ id: p.id, weight: num(p.id) })));
    }
    const t: Record<string, number> = {};
    people.forEach((p) => { t[p.id] = toPence(num(p.id)); });
    return Object.values(t).reduce((a, b) => a + b, 0) === totalPence ? t : null;
  }, [mode, custom, people, totalPence]);

  // "£3.00 left" / "10% over" under the list for the custom modes.
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

  const splitReady = mode === "equal" ? people.length > 0 : targets !== null;

  /** Switch mode, starting everyone on an even split so they only adjust. */
  function pickMode(m: SplitMode) {
    setMode(m);
    if (m === "equal" || people.length === 0) return;
    const n = people.length;
    const next: Record<string, string> = {};
    if (m === "percent") {
      const parts = splitPenceByWeights(10000, people.map((p) => ({ id: p.id, weight: 1 }))); // 100.00% in hundredths
      people.forEach((p) => { next[p.id] = String(parts[p.id] / 100); });
    } else {
      const parts = splitPenceByWeights(totalPence, people.map((p) => ({ id: p.id, weight: 1 })));
      people.forEach((p) => { next[p.id] = n && totalPence ? fromPence(parts[p.id]).toFixed(2) : ""; });
    }
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
    if (lines.length === 0) { setError("Enter at least one cost"); return; }
    if (people.length === 0) { setError("Pick who to split with"); return; }
    if (!splitReady) { setError(mode === "percent" ? "Percentages must add up to 100%" : `Amounts must add up to ${money(total)}`); return; }
    setBusy(true);
    setError(null);
    try {
      const ids = people.map((p) => p.id);
      const perLine = targets ? allocateLines(lines.map((l) => toPence(l.amount)), targets) : null;
      for (const [i, l] of lines.entries()) {
        let shares: { member_id: string; amount: number }[];
        if (perLine) {
          shares = Object.entries(perLine[i])
            .filter(([, p]) => p > 0)
            .map(([member_id, p]) => ({ member_id, amount: fromPence(p) }));
        } else {
          // Rotate who takes the odd penny so it doesn't always land on the same person.
          const rotated = [...ids.slice(i % ids.length), ...ids.slice(0, i % ids.length)];
          shares = equalSplit(l.amount, rotated);
        }
        await expensesApi.add(groupId, { ...l, session_id: sessionId || undefined, shares });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-purple-400 transition-colors";
  const payerSelect = (value: string, set: (v: string) => void) => (
    <select value={value} onChange={(e) => set(e.target.value)} className={`${inputCls} py-2`}>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-display font-black text-gray-900 text-lg">Add costs</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-4">
          {/* Session */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Session</span>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={inputCls}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="">Not tied to a session</option>
            </select>
          </label>

          {/* Court */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
                <LayoutGrid size={13} /> Court cost
              </span>
              {courts.length > 1 && (
                <span className="text-xs font-display font-bold text-gray-500 tabular-nums">
                  Total {money(courts.reduce((t, c) => t + (Math.round((parseFloat(c.amount) || 0) * 100) / 100), 0))}
                </span>
              )}
            </div>
            {courts.length === 1 ? (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="£0.00" aria-label="Court cost"
                  value={courts[0].amount} onChange={(e) => updateCourt(courts[0].key, { amount: e.target.value })} className={inputCls} />
                {payerSelect(courts[0].payer, (v) => updateCourt(courts[0].key, { payer: v }))}
              </div>
            ) : (
              courts.map((c, i) => (
                <div key={c.key} className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50/60 p-2">
                  <div className="flex items-center gap-2">
                    <input placeholder={`Court ${i + 1}`} aria-label={`Court line ${i + 1} name`} value={c.label}
                      onChange={(e) => updateCourt(c.key, { label: e.target.value })} className={`${inputCls} py-2`} />
                    <button type="button" onClick={() => removeCourt(c.key)} aria-label={`Remove court line ${i + 1}`}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="£0.00" aria-label={`Court line ${i + 1} amount`}
                      value={c.amount} onChange={(e) => updateCourt(c.key, { amount: e.target.value })} className={inputCls} />
                    {payerSelect(c.payer, (v) => updateCourt(c.key, { payer: v }))}
                  </div>
                </div>
              ))
            )}
            <button type="button" onClick={addCourt}
              className="self-start flex items-center gap-1 text-xs font-display font-bold text-purple-600 bg-purple-50 rounded-lg px-2.5 py-1.5">
              <Plus size={13} /> Add another court cost
            </button>
          </div>

          {/* Shuttles */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              <Feather size={13} /> Shuttle cost
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="£0.00" value={shuttles} onChange={(e) => setShuttles(e.target.value)} className={inputCls} />
              {payerSelect(shuttlePayer, setShuttlePayer)}
            </div>
            {tubesUsed > 0 && tubePrice > 0 && (
              <button type="button" onClick={() => setShuttles((tubesUsed * tubePrice).toFixed(2))}
                className="self-start text-xs font-display font-bold text-purple-600 bg-purple-50 rounded-lg px-2 py-1">
                {tubesUsed} tube{tubesUsed !== 1 ? "s" : ""} used × {money(tubePrice)} = use {money(tubesUsed * tubePrice)}
              </button>
            )}
          </div>

          {/* Other */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              <Receipt size={13} /> Anything else (optional)
            </span>
            <input placeholder="e.g. Drinks" value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="£0.00" value={other} onChange={(e) => setOther(e.target.value)} className={inputCls} />
              {payerSelect(otherPayer, setOtherPayer)}
            </div>
          </div>

          {/* Split between */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
                Split between · {people.length}
              </span>
              <div className="flex gap-2 text-xs font-display font-bold text-purple-600">
                <button type="button" onClick={() => setSplitIds(new Set(members.map((m) => m.id)))}>All</button>
                <button type="button" onClick={() => setSplitIds(new Set())}>None</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
              {MODES.map((m) => (
                <button key={m.key} type="button" onClick={() => pickMode(m.key)}
                  className={`py-1.5 rounded-lg text-xs font-display font-black transition-all
                    ${mode === m.key ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {sessionId && !loadingPeople && (
              <p className="text-[11px] text-gray-400 font-display">Ticked: everyone who checked in or played at this session.</p>
            )}
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
          <button onClick={save} disabled={busy || lines.length === 0 || people.length === 0 || !splitReady}
            className="w-full py-3.5 rounded-2xl font-display font-black text-white bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all">
            {busy ? "Saving…" : total > 0 && people.length > 0
              ? mode === "equal" ? `Save ${money(total)} · ${money(each)} each` : `Save ${money(total)}`
              : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
