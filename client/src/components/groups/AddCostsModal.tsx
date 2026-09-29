import { useEffect, useMemo, useState } from "react";
import { X, LayoutGrid, Feather, Receipt, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { expensesApi } from "../../services/groups";
import { useSessionStore } from "../../store";
import { equalSplit } from "../../utils/splits";
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
const TYPE_DOT: Record<string, string> = { male: "bg-blue-500", female: "bg-pink-500", guest: "bg-purple-500" };

/**
 * Court + shuttles for a session (or a one-off cost), each with its own payer,
 * split equally between the people who checked in. Saves one expense per line.
 */
export default function AddCostsModal({ groupId, members, sessions, defaultSessionId, defaultPayerId, onSaved, onClose }: Props) {
  const tubePrice = useSessionStore((s) => s.clubConfig?.shuttleTubePrice ?? 0);
  const firstPayer = defaultPayerId ?? members[0]?.id ?? "";

  const [sessionId, setSessionId] = useState<string>(defaultSessionId ?? sessions[0]?.id ?? "");
  const [court, setCourt] = useState("");
  const [courtPayer, setCourtPayer] = useState(firstPayer);
  const [shuttles, setShuttles] = useState("");
  const [shuttlePayer, setShuttlePayer] = useState(firstPayer);
  const [other, setOther] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [otherPayer, setOtherPayer] = useState(firstPayer);
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set());
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
    const c = pence(court), s = pence(shuttles), o = pence(other);
    if (c > 0) l.push({ category: "court", description: "Court hire", amount: c, paid_by: courtPayer });
    if (s > 0) l.push({ category: "shuttles", description: "Shuttles", amount: s, paid_by: shuttlePayer });
    if (o > 0) l.push({ category: "other", description: otherLabel.trim() || "Other", amount: o, paid_by: otherPayer });
    return l;
  }, [court, shuttles, other, otherLabel, courtPayer, shuttlePayer, otherPayer]);

  const total = lines.reduce((t, l) => t + l.amount, 0);
  const people = members.filter((m) => splitIds.has(m.id));
  const each = people.length ? total / people.length : 0;

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
    setBusy(true);
    setError(null);
    try {
      // Rotate who takes the odd penny so it doesn't always land on the same person.
      const ids = people.map((p) => p.id);
      for (const [i, l] of lines.entries()) {
        const rotated = [...ids.slice(i % ids.length), ...ids.slice(0, i % ids.length)];
        await expensesApi.add(groupId, { ...l, session_id: sessionId || undefined, shares: equalSplit(l.amount, rotated) });
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
            <span className="flex items-center gap-1.5 text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              <LayoutGrid size={13} /> Court cost
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="£0.00" value={court} onChange={(e) => setCourt(e.target.value)} className={inputCls} />
              {payerSelect(courtPayer, setCourtPayer)}
            </div>
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
                Split equally between · {people.length}
              </span>
              <div className="flex gap-2 text-xs font-display font-bold text-purple-600">
                <button type="button" onClick={() => setSplitIds(new Set(members.map((m) => m.id)))}>All</button>
                <button type="button" onClick={() => setSplitIds(new Set())}>None</button>
              </div>
            </div>
            {sessionId && !loadingPeople && (
              <p className="text-[11px] text-gray-400 font-display">Ticked: everyone who checked in or played at this session.</p>
            )}
            <div className="flex flex-col rounded-2xl border border-gray-100 overflow-hidden">
              {members.map((m) => {
                const on = splitIds.has(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => toggle(m.id)}
                    className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-0 text-left">
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? "bg-purple-500 border-purple-500 text-white" : "border-gray-300"}`}>
                      {on && <Check size={12} />}
                    </span>
                    <span className={`w-7 h-7 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-[11px] flex-shrink-0`}>
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{m.name}</span>
                    {on && each > 0 && <span className="text-xs font-display font-bold text-gray-400 tabular-nums">{money(each)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 pt-3 pb-5 border-t border-gray-100 flex flex-col gap-2">
          {error && <p className="text-sm text-red-600 font-display font-bold">{error}</p>}
          <button onClick={save} disabled={busy || lines.length === 0 || people.length === 0}
            className="w-full py-3.5 rounded-2xl font-display font-black text-white bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all">
            {busy ? "Saving…" : total > 0 && people.length > 0
              ? `Save ${money(total)} · ${money(each)} each`
              : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
