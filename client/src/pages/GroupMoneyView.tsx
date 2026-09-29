import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, ArrowRight, Trash2, LayoutGrid, Feather, Receipt, HandCoins, Wallet } from "lucide-react";
import { useGroupStore } from "../store";
import { groupsApi, expensesApi } from "../services/groups";
import { supabase } from "../lib/supabase";
import { computeBalances, simplifyDebts } from "../utils/splits";
import AddCostsModal, { type CostSession } from "../components/groups/AddCostsModal";
import type { GroupExpense, GroupSettlement, ExpenseCategory } from "../types";

const money = (n: number) => `£${Math.abs(n).toFixed(2)}`;
const TYPE_DOT: Record<string, string> = { male: "bg-blue-500", female: "bg-pink-500", guest: "bg-purple-500" };
const CAT_ICON: Record<ExpenseCategory, JSX.Element> = {
  court: <LayoutGrid size={14} />,
  shuttles: <Feather size={14} />,
  other: <Receipt size={14} />,
};

function sessionLabel(s: any): string {
  const d = new Date(s.scheduled_at ?? `${s.date}T12:00:00`);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return s.venue ? `${day} · ${s.venue}` : day;
}

/** Splitwise-style costs page for a friends group: who owes whom, settle up, history. */
export default function GroupMoneyView() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const group = useGroupStore((s) => s.groups.find((g) => g.id === id));
  const upsertGroup = useGroupStore((s) => s.upsertGroup);

  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [settlements, setSettlements] = useState<GroupSettlement[]>([]);
  const [sessions, setSessions] = useState<CostSession[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(!!params.get("session"));
  const [busy, setBusy] = useState<string | null>(null);

  const isOwner = !!userId && group?.owner_id === userId;

  async function loadLedger() {
    if (!id) return;
    try {
      const l = await expensesApi.ledger(id);
      setExpenses(l.expenses);
      setSettlements(l.settlements);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Couldn't load costs");
    }
  }

  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    groupsApi.get(id).then((g) => { if (g) upsertGroup(g); }).catch(() => {});
    groupsApi.myMemberId(id).then(setMyMemberId).catch(() => {});
    supabase.from("sessions").select("id, date, scheduled_at, venue, status").eq("group_id", id)
      .in("status", ["active", "completed", "ended"])
      .order("date", { ascending: false })
      .then(({ data }) => setSessions((data ?? []).map((s: any) => ({ id: s.id, label: sessionLabel(s) }))));
    loadLedger().finally(() => setLoading(false));
  }, [id]);

  const members = group?.members ?? [];
  const nameOf = (mid: string) => members.find((m) => m.id === mid)?.name ?? "Former member";
  const typeOf = (mid: string) => members.find((m) => m.id === mid)?.member_type ?? "guest";
  const sessionName = (sid?: string) => sessions.find((s) => s.id === sid)?.label;

  const balances = useMemo(() => computeBalances(expenses, settlements), [expenses, settlements]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  const myBalance = myMemberId ? (balances[myMemberId] ?? 0) / 100 : 0;
  const totalSpent = expenses.reduce((t, e) => t + e.amount, 0);

  // Expenses grouped by session (newest first), then settle-ups, for the activity list.
  const activity = useMemo(() => {
    const items: ({ kind: "expense"; at: string; e: GroupExpense } | { kind: "settle"; at: string; s: GroupSettlement })[] = [
      ...expenses.map((e) => ({ kind: "expense" as const, at: e.created_at, e })),
      ...settlements.map((s) => ({ kind: "settle" as const, at: s.created_at, s })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [expenses, settlements]);

  async function settle(from: string, to: string, amount: number) {
    if (!id) return;
    if (!confirm(`Record that ${nameOf(from)} paid ${nameOf(to)} ${money(amount)}?`)) return;
    setBusy(`${from}-${to}`);
    try {
      await expensesApi.settle(id, from, to, amount);
      await loadLedger();
    } catch (e: any) {
      alert(`Couldn't record payment: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function removeExpense(e: GroupExpense) {
    if (!confirm(`Delete ${e.description} (${money(e.amount)})?`)) return;
    try { await expensesApi.remove(e.id); await loadLedger(); }
    catch (err: any) { alert(err?.message ?? "Couldn't delete"); }
  }

  async function removeSettlement(s: GroupSettlement) {
    if (!confirm(`Undo ${nameOf(s.from_member)} → ${nameOf(s.to_member)} ${money(s.amount)}?`)) return;
    try { await expensesApi.removeSettlement(s.id); await loadLedger(); }
    catch (err: any) { alert(err?.message ?? "Couldn't undo"); }
  }

  if (!group) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-50">
        <div className="w-9 h-9 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  const sortedBalances = members
    .map((m) => ({ m, p: balances[m.id] ?? 0 }))
    .sort((a, b) => b.p - a.p);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gray-50">
      <header className="flex items-center gap-3 px-4 pt-5 pb-3 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}>
        <button onClick={() => navigate(`/groups/${id}`)} className="p-2 rounded-xl bg-white/15 border border-white/20 text-white flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-black text-white text-lg leading-tight truncate">Costs &amp; balances</h1>
          <p className="text-white/50 text-xs font-display truncate">{group.name} · {money(totalSpent)} spent in total</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-28 max-w-xl w-full mx-auto flex flex-col gap-3">
        {loadError && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl px-4 py-3 text-sm font-display font-bold">
            {loadError}
            {/function .* does not exist|schema cache/i.test(loadError) && (
              <p className="text-xs font-normal mt-1">Run migration 022_group_expenses.sql in Supabase first.</p>
            )}
          </div>
        )}

        {/* Your status */}
        {myMemberId && !loading && (
          <div className={`rounded-3xl p-5 text-white shadow-lg ${myBalance > 0.004 ? "bg-gradient-to-br from-green-500 to-green-400" : myBalance < -0.004 ? "bg-gradient-to-br from-orange-500 to-red-400" : "bg-gradient-to-br from-gray-500 to-gray-400"}`}>
            <div className="flex items-center gap-2 opacity-80 text-xs font-display font-bold uppercase tracking-wider">
              <Wallet size={14} /> Your balance
            </div>
            <p className="font-display font-black text-3xl mt-1 tabular-nums">
              {myBalance > 0.004 ? `You are owed ${money(myBalance)}` : myBalance < -0.004 ? `You owe ${money(myBalance)}` : "All settled up"}
            </p>
            {transfers.filter((t) => t.from === myMemberId || t.to === myMemberId).map((t) => (
              <p key={`${t.from}-${t.to}`} className="text-sm font-display font-bold opacity-90 mt-1">
                {t.from === myMemberId ? `Pay ${nameOf(t.to)} ${money(t.amount)}` : `${nameOf(t.from)} owes you ${money(t.amount)}`}
              </p>
            ))}
          </div>
        )}

        {/* Settle up — fewest payments to square everyone */}
        <div className="bg-white border border-orange-200 rounded-3xl shadow-md shadow-black/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <HandCoins size={15} className="text-green-600" />
            <span className="font-display font-black text-gray-900 text-sm">Settle up</span>
          </div>
          {transfers.length === 0 ? (
            <p className="text-gray-400 text-sm font-display text-center pb-5 pt-2">{loading ? "Loading…" : "Nobody owes anything 🎉"}</p>
          ) : (
            <div className="border-t border-gray-100">
              {transfers.map((t) => (
                <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="font-display font-bold text-gray-800 text-sm truncate">{nameOf(t.from)}</span>
                  <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="font-display font-bold text-gray-800 text-sm truncate flex-1">{nameOf(t.to)}</span>
                  <span className="font-display font-black text-gray-900 text-sm tabular-nums">{money(t.amount)}</span>
                  {(isOwner || t.from === myMemberId || t.to === myMemberId) && (
                    <button onClick={() => settle(t.from, t.to, t.amount)} disabled={busy === `${t.from}-${t.to}`}
                      className="ml-1 px-2.5 py-1 rounded-lg bg-green-500 text-white text-xs font-display font-black active:scale-95 disabled:opacity-50">
                      {busy === `${t.from}-${t.to}` ? "…" : "Paid"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Everyone's balance */}
        <div className="bg-white border border-orange-200 rounded-3xl shadow-md shadow-black/5 overflow-hidden">
          <div className="px-4 pt-4 pb-2 font-display font-black text-gray-900 text-sm">Balances</div>
          <div className="border-t border-gray-100">
            {sortedBalances.map(({ m, p }) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                <span className={`w-8 h-8 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-xs flex-shrink-0`}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">
                  {m.name}{m.id === myMemberId && <span className="text-gray-400 font-normal"> (you)</span>}
                </span>
                <span className={`text-sm font-display font-black tabular-nums ${p > 0 ? "text-green-600" : p < 0 ? "text-orange-600" : "text-gray-300"}`}>
                  {p > 0 ? `gets back ${money(p / 100)}` : p < 0 ? `owes ${money(p / 100)}` : "settled"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="bg-white border border-orange-200 rounded-3xl shadow-md shadow-black/5 overflow-hidden">
          <div className="px-4 pt-4 pb-2 font-display font-black text-gray-900 text-sm">Activity</div>
          {activity.length === 0 ? (
            <p className="text-gray-400 text-sm font-display text-center pb-5 pt-2">No costs yet — add court and shuttles after a session.</p>
          ) : (
            <div className="border-t border-gray-100">
              {activity.map((a) => a.kind === "expense" ? (
                <div key={a.e.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">{CAT_ICON[a.e.category]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-gray-800 text-sm truncate">{a.e.description}</p>
                    <p className="text-gray-400 text-xs font-display truncate">
                      {nameOf(a.e.paid_by)} paid · split {a.e.shares.length} way{a.e.shares.length !== 1 ? "s" : ""}
                      {sessionName(a.e.session_id) && ` · ${sessionName(a.e.session_id)}`}
                    </p>
                    {myMemberId && (() => {
                      const mine = a.e.shares.find((s) => s.member_id === myMemberId)?.amount ?? 0;
                      const lent = a.e.paid_by === myMemberId ? a.e.amount - mine : -mine;
                      if (Math.abs(lent) < 0.005) return null;
                      return (
                        <p className={`text-xs font-display font-bold ${lent > 0 ? "text-green-600" : "text-orange-600"}`}>
                          {lent > 0 ? `you lent ${money(lent)}` : `you borrowed ${money(lent)}`}
                        </p>
                      );
                    })()}
                  </div>
                  <span className="font-display font-black text-gray-900 text-sm tabular-nums">{money(a.e.amount)}</span>
                  {(isOwner || a.e.created_by === userId) && (
                    <button onClick={() => removeExpense(a.e)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              ) : (
                <div key={a.s.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0"><HandCoins size={14} /></span>
                  <p className="flex-1 min-w-0 font-display font-bold text-gray-800 text-sm truncate">
                    {nameOf(a.s.from_member)} paid {nameOf(a.s.to_member)}
                  </p>
                  <span className="font-display font-black text-green-600 text-sm tabular-nums">{money(a.s.amount)}</span>
                  {(isOwner || a.s.created_by === userId) && (
                    <button onClick={() => removeSettlement(a.s)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 max-w-xl mx-auto">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 shadow-2xl shadow-purple-500/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
          <Plus size={20} /> Add court &amp; shuttle costs
        </button>
      </div>

      {showAdd && (
        <AddCostsModal
          groupId={group.id}
          members={members}
          sessions={sessions}
          defaultSessionId={params.get("session") ?? undefined}
          defaultPayerId={myMemberId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadLedger(); }}
        />
      )}
    </div>
  );
}
