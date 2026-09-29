import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, Archive, RotateCcw, AlertTriangle, MessageSquare, Trash2, Send } from "lucide-react";
import AdminPage from "../components/admin/AdminPage";
import Avatar from "../components/shared/Avatar";
import PayRow, { money } from "../components/admin/PayRow";
import { membersApi } from "../services/api";
import { paymentsApi } from "../services/payments";
import { plansApi, notesApi, attendanceApi, type AttendanceRow } from "../services/membership";
import { useMemberStore, useAuthStore } from "../store";
import { STATUS_META, effectiveStatus, statusPatch } from "../utils/memberStatus";
import { LEVELS, LEVEL_LABELS } from "../types";
import type { Member, MemberNote, MembershipDue, SessionFee, MembershipPlan, MemberType, PaymentStatus, PaidMethod } from "../types";

type Tab = "details" | "payments" | "attendance" | "notes";

const input = "border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm bg-white w-full focus:outline-none focus:border-orange-400";
const label = "text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider";
const fmtDate = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MemberProfileView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { members, setMembers, updateMember } = useMemberStore();
  const adminName = useAuthStore((s) => s.adminName);

  const [tab, setTab] = useState<Tab>("details");
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [dues, setDues] = useState<MembershipDue[]>([]);
  const [fees, setFees] = useState<SessionFee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [loaded, setLoaded] = useState(false);

  const member = members[id];

  useEffect(() => {
    (async () => {
      const [{ members: list }, ps, d, f, a, n] = await Promise.all([
        members[id] ? Promise.resolve({ members: Object.values(members) }) : membersApi.list(),
        plansApi.list(),
        paymentsApi.listDues(),
        paymentsApi.listSessionFees(),
        attendanceApi.forMember(id),
        notesApi.list(id),
      ]);
      if (!members[id]) setMembers(list);
      setPlans(ps);
      setDues(d.filter((x) => x.member_id === id));
      setFees(f.filter((x) => x.member_id === id));
      setAttendance(a);
      setNotes(n);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(p: Partial<Member>) {
    const { member: m } = await membersApi.update(id, p);
    updateMember(id, m);
  }

  if (!member) {
    return (
      <AdminPage title={loaded ? "Member not found" : "Loading…"}>
        <button onClick={() => navigate("/members")} className="text-sm font-display font-bold text-orange-600 flex items-center gap-1">
          <ArrowLeft size={14} /> All members
        </button>
      </AdminPage>
    );
  }

  const status = effectiveStatus(member);
  const owed = [...dues, ...fees].filter((x) => x.status === "unpaid").reduce((s, x) => s + x.amount_due, 0);

  return (
    <AdminPage
      title={member.name}
      subtitle={`${STATUS_META[status].label} · ${plans.find((p) => p.id === member.plan_id)?.name ?? "No plan"} · ${LEVEL_LABELS[member.level ?? 2]}`}
      aside={
        <button onClick={() => navigate("/members")}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl text-sm font-display font-bold border border-white/20">
          <ArrowLeft size={14} /> All members
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Identity strip */}
        <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm p-4 flex items-center gap-4">
          <Avatar name={member.name} memberType={member.member_type} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-black text-lg text-gray-900">{member.name}</span>
              <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-md border ${STATUS_META[status].cls}`}>
                {STATUS_META[status].label}
              </span>
            </div>
            <div className="text-xs text-gray-500 font-display mt-0.5">
              {member.joined_at ? `Joined ${fmtDate(member.joined_at)}` : "Join date unknown"}
              {status === "paused" && member.paused_until ? ` · paused until ${fmtDate(member.paused_until)}` : ""}
              {status === "paused" && member.pause_reason ? ` (${member.pause_reason})` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className={`font-display font-black text-lg ${owed > 0 ? "text-amber-600" : "text-green-600"}`}>{owed > 0 ? money(owed) : "✓"}</div>
            <div className="text-[10px] text-gray-400 font-display uppercase tracking-wider">{owed > 0 ? "owed" : "nothing owed"}</div>
          </div>
        </div>

        <StatusActions member={member} status={status} onPatch={patch} />

        <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-2xl p-1">
          {([["details", "Details"], ["payments", "Payments"], ["attendance", "Attendance"], ["notes", `Notes${notes.length ? ` (${notes.length})` : ""}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2 rounded-xl text-xs font-display font-bold transition-all ${tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm p-4 sm:p-6">
          {tab === "details" && <DetailsTab member={member} plans={plans} onPatch={patch} />}
          {tab === "payments" && (
            <PaymentsTab member={member} dues={dues} fees={fees}
              onDue={(d) => setDues((xs) => xs.map((x) => (x.id === d.id ? d : x)))}
              onFee={(f) => setFees((xs) => xs.map((x) => (x.id === f.id ? f : x)))} />
          )}
          {tab === "attendance" && <AttendanceTab rows={attendance} />}
          {tab === "notes" && (
            <NotesTab notes={notes} author={adminName} memberId={id}
              onAdded={(n) => setNotes((xs) => [n, ...xs])}
              onDeleted={(nid) => setNotes((xs) => xs.filter((x) => x.id !== nid))} />
          )}
        </div>
      </div>
    </AdminPage>
  );
}

// ─── Status actions: pause / resume / lapse / archive ─────────────────────────

function StatusActions({ member, status, onPatch }: { member: Member; status: Member["status"] & {}; onPatch: (p: Partial<Member>) => Promise<void> }) {
  const [pausing, setPausing] = useState(false);
  const [from, setFrom] = useState(todayISO());
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(p: Partial<Member>) {
    setBusy(true);
    try { await onPatch(p); setPausing(false); } finally { setBusy(false); }
  }

  const btn = "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-bold transition-all disabled:opacity-50 active:scale-95";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "paused" ? (
          <button disabled={busy} onClick={() => run(statusPatch("active"))} className={`${btn} bg-green-500 text-white hover:bg-green-600`}>
            <Play size={13} /> Resume membership
          </button>
        ) : status !== "archived" && (
          <button disabled={busy} onClick={() => setPausing((v) => !v)} className={`${btn} bg-amber-100 text-amber-800 hover:bg-amber-200`}>
            <Pause size={13} /> Pause membership
          </button>
        )}
        {status === "trial" && (
          <button disabled={busy} onClick={() => run(statusPatch("active", { joined_at: member.joined_at ?? todayISO() }))} className={`${btn} bg-green-100 text-green-800 hover:bg-green-200`}>
            <Play size={13} /> Make full member
          </button>
        )}
        {(status === "active" || status === "trial") && (
          <button disabled={busy} onClick={() => run(statusPatch("lapsed"))} className={`${btn} bg-red-50 text-red-700 hover:bg-red-100`}>
            <AlertTriangle size={13} /> Mark lapsed
          </button>
        )}
        {status === "lapsed" && (
          <button disabled={busy} onClick={() => run(statusPatch("active"))} className={`${btn} bg-green-100 text-green-800 hover:bg-green-200`}>
            <RotateCcw size={13} /> Reinstate
          </button>
        )}
        {status === "archived" ? (
          <button disabled={busy} onClick={() => run(statusPatch("active"))} className={`${btn} bg-violet-100 text-violet-800 hover:bg-violet-200`}>
            <RotateCcw size={13} /> Restore
          </button>
        ) : (
          <button disabled={busy} onClick={() => confirm(`Archive ${member.name}? They leave every roster but keep their history.`) && run(statusPatch("archived"))}
            className={`${btn} bg-gray-100 text-gray-600 hover:bg-gray-200 ml-auto`}>
            <Archive size={13} /> Archive
          </button>
        )}
      </div>

      {pausing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div><span className={label}>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></div>
          <div><span className={label}>Until (optional)</span><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={input} /></div>
          <div><span className={label}>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Injury, travel…" className={input} /></div>
          <button disabled={busy || !from}
            onClick={() => run(statusPatch("paused", { paused_from: from, paused_until: until || null, pause_reason: reason.trim() || null }))}
            className={`${btn} bg-amber-500 text-white hover:bg-amber-600 justify-center`}>
            <Pause size={13} /> {busy ? "Pausing…" : "Pause"}
          </button>
          <p className="sm:col-span-4 text-[11px] text-amber-800 font-display">No dues are generated while paused. With an end date, membership resumes automatically.</p>
        </div>
      )}
    </div>
  );
}

// ─── Details ──────────────────────────────────────────────────────────────────

function DetailsTab({ member, plans, onPatch }: { member: Member; plans: MembershipPlan[]; onPatch: (p: Partial<Member>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: member.name,
    member_type: member.member_type as MemberType,
    level: member.level ?? 2,
    plan_id: member.plan_id ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    emergency_contact: member.emergency_contact ?? "",
    joined_at: member.joined_at ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof form, v: string | number) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify({
    name: member.name, member_type: member.member_type, level: member.level ?? 2, plan_id: member.plan_id ?? "",
    email: member.email ?? "", phone: member.phone ?? "", emergency_contact: member.emergency_contact ?? "", joined_at: member.joined_at ?? "",
  }), [form, member]);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onPatch({
        name: form.name.trim(),
        member_type: form.member_type,
        level: form.level,
        plan_id: form.plan_id || null,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        emergency_contact: form.emergency_contact.trim() || undefined,
        joined_at: form.joined_at || undefined,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span className={label}>Full name</span><input value={form.name} onChange={(e) => set("name", e.target.value)} className={input} /></div>
        <div>
          <span className={label}>Gender</span>
          <div className="flex gap-2">
            {(["male", "female"] as MemberType[]).map((g) => (
              <button key={g} onClick={() => set("member_type", g)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-display font-bold transition-all
                  ${form.member_type === g ? (g === "female" ? "bg-pink-100 text-pink-700 border-pink-300" : "bg-blue-100 text-blue-700 border-blue-300") : "bg-white text-gray-400 border-gray-200"}`}>
                {g === "female" ? "♀ Female" : "♂ Male"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Membership plan</span>
          <select value={form.plan_id} onChange={(e) => set("plan_id", e.target.value)} className={input}>
            <option value="">No plan</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.fee)}</option>)}
          </select>
        </div>
        <div><span className={label}>Joined</span><input type="date" value={form.joined_at} onChange={(e) => set("joined_at", e.target.value)} className={input} /></div>
        <div><span className={label}>Email</span><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={input} /></div>
        <div><span className={label}>Mobile</span><input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 7…" className={input} /></div>
        <div className="sm:col-span-2"><span className={label}>Emergency contact</span><input value={form.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} placeholder="Name and number" className={input} /></div>
      </div>
      <div>
        <span className={label}>Skill level</span>
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <button key={l} onClick={() => set("level", l)} title={LEVEL_LABELS[l]}
              className={`flex-1 py-1.5 rounded-xl border-2 text-xs font-display font-bold transition-all
                ${form.level === l ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-400 border-gray-200"}`}>
              L{l}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 font-display mt-1">{LEVEL_LABELS[form.level]}</p>
      </div>
      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-xs font-display font-bold text-green-600">Saved</span>}
        <button onClick={save} disabled={saving || !dirty || !form.name.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-display font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────────

function PaymentsTab({ member, dues, fees, onDue, onFee }: {
  member: Member; dues: MembershipDue[]; fees: SessionFee[];
  onDue: (d: MembershipDue) => void; onFee: (f: SessionFee) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const setDue = async (d: MembershipDue, s: PaymentStatus, m?: PaidMethod) => {
    setBusy(d.id); try { onDue(await paymentsApi.setDueStatus(d.id, s, m)); } finally { setBusy(null); }
  };
  const setFee = async (f: SessionFee, s: PaymentStatus, m?: PaidMethod) => {
    setBusy(f.id); try { onFee(await paymentsApi.setSessionFeeStatus(f.id, s, m)); } finally { setBusy(null); }
  };
  if (dues.length === 0 && fees.length === 0) {
    return <p className="text-center text-sm text-gray-400 font-display font-bold py-8">No charges yet. Bill a period from Finance.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {dues.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={label}>Membership dues</span>
          {dues.map((d) => (
            <PayRow key={d.id} title={d.period_label} amount={d.amount_due} status={d.status} method={d.paid_method} paidAt={d.paid_at}
              busy={busy === d.id} onSet={(s, m) => setDue(d, s, m)} />
          ))}
        </div>
      )}
      {fees.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={label}>Night fees</span>
          {fees.map((f) => (
            <PayRow key={f.id} title={`Night · ${fmtDate(f.created_at)}`} amount={f.amount_due} status={f.status} method={f.paid_method} paidAt={f.paid_at}
              busy={busy === f.id} onSet={(s, m) => setFee(f, s, m)} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 font-display">{member.name} · payments are recorded here, money moves outside the app.</p>
    </div>
  );
}

// ─── Attendance ───────────────────────────────────────────────────────────────

function AttendanceTab({ rows }: { rows: AttendanceRow[] }) {
  if (rows.length === 0) return <p className="text-center text-sm text-gray-400 font-display font-bold py-8">Hasn't checked in to a night yet</p>;
  const last = rows[0];
  const weeksAgo = Math.floor((Date.now() - new Date(last.checked_in_at).getTime()) / (7 * 864e5));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border px-4 py-3 bg-green-50 border-green-200 text-green-800">
          <p className="text-[10px] font-display font-bold uppercase tracking-wider opacity-70">Nights played</p>
          <p className="text-lg font-display font-black">{rows.length}</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${weeksAgo >= 6 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
          <p className="text-[10px] font-display font-bold uppercase tracking-wider opacity-70">Last seen</p>
          <p className="text-lg font-display font-black">{weeksAgo === 0 ? "This week" : `${weeksAgo}w ago`}</p>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.slice(0, 30).map((r) => (
          <div key={r.session_id} className="flex items-center justify-between py-2 text-sm font-display">
            <span className="font-bold text-gray-800">{fmtDate(r.date)}</span>
            <span className="text-gray-400 text-xs">{new Date(r.checked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function NotesTab({ notes, author, memberId, onAdded, onDeleted }: {
  notes: MemberNote[]; author: string | null; memberId: string;
  onAdded: (n: MemberNote) => void; onDeleted: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    try { onAdded(await notesApi.add(memberId, body, author)); setBody(""); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
          placeholder="Add a committee note — injuries, agreements, anything the next person should know"
          className={`${input} resize-none`} />
        <button onClick={add} disabled={busy || !body.trim()}
          className="px-4 rounded-xl bg-orange-500 text-white font-display font-bold text-sm hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1">
          <Send size={14} />
        </button>
      </div>
      {notes.length === 0 && <p className="text-center text-sm text-gray-400 font-display font-bold py-6">No notes yet</p>}
      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <div key={n.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3">
            <MessageSquare size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body text-gray-800 whitespace-pre-wrap">{n.body}</p>
              <p className="text-[11px] text-gray-400 font-display mt-1">{n.author ?? "Committee"} · {fmtDate(n.created_at)}</p>
            </div>
            <button onClick={() => confirm("Delete this note?") && notesApi.delete(n.id).then(() => onDeleted(n.id))}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 self-start">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
