import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus, ChevronRight } from "lucide-react";
import AdminPage from "../components/admin/AdminPage";
import Avatar from "../components/shared/Avatar";
import { membersApi } from "../services/api";
import { plansApi } from "../services/membership";
import { useMemberStore } from "../store";
import { STATUS_META, effectiveStatus, statusPatch } from "../utils/memberStatus";
import { LEVELS, LEVEL_LABELS } from "../types";
import type { Member, MemberStatus, MemberType, MembershipPlan } from "../types";

type Filter = "all" | MemberStatus;
const FILTERS: Filter[] = ["all", "active", "trial", "paused", "lapsed", "archived"];

const GENDER: { value: MemberType; label: string; cls: string }[] = [
  { value: "male",   label: "♂ Male",   cls: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "female", label: "♀ Female", cls: "bg-pink-100 text-pink-700 border-pink-300" },
];

export default function MembersView() {
  const navigate = useNavigate();
  const { members, setMembers, addMember, updateMember } = useMemberStore();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ members: list }, ps] = await Promise.all([membersApi.list(), plansApi.list()]);
      setMembers(list);
      setPlans(ps);
      setLoading(false);
      // A pause whose end date has passed resumes the member
      for (const m of list) {
        if (m.status === "paused" && effectiveStatus(m) === "active") {
          membersApi.update(m.id, statusPatch("active")).then(({ member }) => updateMember(m.id, member));
        }
      }
    })();
  }, [setMembers, updateMember]);

  const all = useMemo(
    () => Object.values(members).filter((m) => m.member_type !== "guest").sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, guest: 0, active: 0, trial: 0, paused: 0, lapsed: 0, archived: 0 };
    all.forEach((m) => { c[effectiveStatus(m)] += 1; });
    c.all = all.length - c.archived;
    return c;
  }, [all]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((m) => {
      const s = effectiveStatus(m);
      if (filter === "all" ? s === "archived" : s !== filter) return false;
      return !q || m.name.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q) || (m.phone ?? "").includes(q);
    });
  }, [all, filter, query]);

  const planName = (id?: string | null) => plans.find((p) => p.id === id)?.name;

  return (
    <AdminPage
      title="Members"
      subtitle={`${counts.active} active · ${counts.paused} paused · ${counts.lapsed} lapsed`}
      aside={
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 bg-white text-orange-600 px-3 py-2 rounded-xl text-sm font-display font-bold shadow-sm hover:bg-orange-50 active:scale-95 transition-all"
        >
          <UserPlus size={15} /> Add member
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {showAdd && (
          <AddMemberCard
            plans={plans.filter((p) => p.active)}
            onAdded={(m) => { addMember(m); setShowAdd(false); navigate(`/members/${m.id}`); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex items-center gap-2 bg-white rounded-2xl border border-gray-200 px-3 py-2.5 flex-1">
            <Search size={15} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or phone"
              className="flex-1 bg-transparent font-body text-sm focus:outline-none"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-xl text-xs font-display font-bold whitespace-nowrap transition-all border
                  ${filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              >
                {f === "all" ? "All" : STATUS_META[f].label} <span className="opacity-60">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {loading && <p className="text-center text-sm text-gray-400 font-display font-bold py-10">Loading…</p>}
          {!loading && shown.length === 0 && (
            <p className="text-center text-sm text-gray-400 font-display font-bold py-10">
              {all.length === 0 ? "No members yet — add your first one" : "Nobody matches"}
            </p>
          )}
          {shown.map((m) => {
            const s = effectiveStatus(m);
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/members/${m.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white transition-colors text-left"
              >
                <Avatar name={m.name} memberType={m.member_type} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm text-gray-900 truncate">{m.name}</div>
                  <div className="text-[11px] text-gray-400 font-display truncate">
                    {planName(m.plan_id) ?? "No plan"} · L{m.level ?? 2}
                    {s === "paused" && m.paused_until ? ` · until ${m.paused_until}` : ""}
                  </div>
                </div>
                <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-md border ${STATUS_META[s].cls}`}>
                  {STATUS_META[s].label}
                </span>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            );
          })}
        </div>
      </div>
    </AdminPage>
  );
}

function AddMemberCard({ plans, onAdded, onCancel }: {
  plans: MembershipPlan[];
  onAdded: (m: Member) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<MemberType>("male");
  const [level, setLevel] = useState(2);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [status, setStatus] = useState<MemberStatus>("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!planId && plans[0]) setPlanId(plans[0].id); }, [plans, planId]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { member } = await membersApi.create(name.trim(), gender, undefined, level);
      const today = new Date().toISOString().slice(0, 10);
      const { member: full } = await membersApi.update(member.id, {
        ...statusPatch(status),
        plan_id: planId || null,
        joined_at: today,
      });
      onAdded(full);
    } finally {
      setBusy(false);
    }
  }

  const input = "border-2 border-orange-200 rounded-xl px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-orange-400 w-full";

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-3xl p-4 sm:p-5 flex flex-col gap-3">
      <p className="text-xs font-display font-bold text-orange-700 uppercase tracking-wider">New member</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Full name" className={input} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex gap-2">
          {GENDER.map((g) => (
            <button key={g.value} onClick={() => setGender(g.value)}
              className={`flex-1 py-2 rounded-xl border-2 text-xs font-display font-bold transition-all
                ${gender === g.value ? g.cls + " border-current" : "bg-white text-gray-400 border-gray-200"}`}>
              {g.label}
            </button>
          ))}
        </div>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={input}>
          {plans.length === 0 && <option value="">No plan</option>}
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} plan</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)} className={input}>
          <option value="active">Active member</option>
          <option value="trial">Trial</option>
        </select>
      </div>
      <div>
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <button key={l} onClick={() => setLevel(l)} title={LEVEL_LABELS[l]}
              className={`flex-1 py-1.5 rounded-xl border-2 text-xs font-display font-bold transition-all
                ${level === l ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-400 border-gray-200"}`}>
              L{l}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 font-display mt-1 text-center">{LEVEL_LABELS[level]}</p>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-display font-bold text-gray-500 hover:bg-orange-100">Cancel</button>
        <button onClick={add} disabled={busy || !name.trim()}
          className="px-4 py-2 rounded-xl text-sm font-display font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all">
          {busy ? "Adding…" : "Add member"}
        </button>
      </div>
    </div>
  );
}
