import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Crown, ChevronRight, X } from "lucide-react";
import { accessApi, PERMISSIONS, TITLE_PRESETS } from "../services/access";
import type { GroupPerson, Permission } from "../services/access";
import { supabase } from "../lib/supabase";

/** People & roles for one group: who is Admin / Member, their title, their features. */
export default function GroupPeopleView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [people, setPeople] = useState<GroupPerson[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<GroupPerson | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
      setPeople(await accessApi.listPeople(id));
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const mine = people?.find((p) => p.user_id === me);
  const iAmOwner = !!mine?.is_owner;
  const canManage = iAmOwner || !!mine?.permissions.includes("manage_access");

  return (
    <div className="min-h-screen bg-[#faf8f6] pb-10">
      <div className="bg-white border-b border-[#eadfd6] px-5 pt-12 pb-3.5 flex items-center gap-3">
        <button onClick={() => navigate(`/groups/${id}`)} aria-label="Back" className="p-1 -ml-1 text-gray-500"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-semibold text-gray-900">People &amp; roles</h1>
      </div>

      <div className="px-5 pt-4 space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!people && !error && <p className="text-sm text-gray-400">Loading…</p>}
        {people?.map((p) => {
          const tappable = canManage && !p.is_owner && p.user_id !== me && (iAmOwner || p.access === "member");
          return (
            <button key={p.user_id} disabled={!tappable} onClick={() => setEditing(p)}
              className="w-full bg-white border border-[#eadfd6] rounded-2xl px-4 py-3 flex items-center gap-3 text-left disabled:opacity-100">
              <span className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold flex-shrink-0">
                {p.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-gray-900 truncate">
                  {p.display_name}{p.user_id === me ? " (you)" : ""}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {p.is_owner ? "Owner" : p.access === "admin" ? "Admin" : "Member"}{p.title ? ` · ${p.title}` : ""}
                </span>
              </span>
              {p.is_owner && <Crown size={16} className="text-amber-500" />}
              {tappable && <ChevronRight size={16} className="text-gray-300" />}
            </button>
          );
        })}
        {people && !canManage && (
          <p className="text-xs text-gray-500 pt-2">Only people allowed to change access can edit roles.</p>
        )}
      </div>

      {editing && id && (
        <AccessSheet groupId={id} person={editing} iAmOwner={iAmOwner}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function AccessSheet({ groupId, person, iAmOwner, onClose, onSaved }: {
  groupId: string; person: GroupPerson; iAmOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [access, setAccess] = useState<"admin" | "member">(person.access);
  const [title, setTitle] = useState(person.title ?? "");
  const [perms, setPerms] = useState<Permission[]>(person.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const visible = PERMISSIONS.filter((p) => p.key !== "manage_access" || iAmOwner);
  const toggle = (k: Permission) => setPerms((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  function pickTitle(t: string) {
    setTitle(t);
    const preset = TITLE_PRESETS.find((p) => p.title === t);
    if (preset) setPerms(preset.permissions);
    if (access === "member") setAccess("admin");
  }

  async function save() {
    setSaving(true); setError("");
    try { await accessApi.setAccess(groupId, person.user_id, access, title, access === "admin" ? perms : []); onSaved(); }
    catch (e) { setError((e as Error).message); setSaving(false); }
  }
  async function remove() {
    setSaving(true); setError("");
    try { await accessApi.remove(groupId, person.user_id); onSaved(); }
    catch (e) { setError((e as Error).message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl px-5 pt-3 pb-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded bg-gray-200 mx-auto" />
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold">{person.display_name.charAt(0).toUpperCase()}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-semibold text-gray-900 truncate">{person.display_name}</p>
            {person.email && <p className="text-xs text-gray-500 truncate">{person.email}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400"><X size={18} /></button>
        </div>

        <div className="bg-[#faf8f6] border border-[#eadfd6] rounded-2xl p-3">
          <p className="text-[11px] font-semibold tracking-wider text-gray-500">TITLE</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Treasurer (changes nothing on its own)"
            className="w-full bg-transparent text-[15px] font-medium outline-none mt-1" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TITLE_PRESETS.map((p) => (
              <button key={p.title} onClick={() => pickTitle(p.title)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${title === p.title ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"}`}>
                {p.title}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] font-semibold tracking-wider text-gray-500">ACCESS LEVEL</p>
        <div className="grid grid-cols-2 gap-1.5 bg-gray-100 rounded-xl p-1">
          {(["admin", "member"] as const).map((a) => (
            <button key={a} onClick={() => setAccess(a)}
              className={`py-2 rounded-lg text-sm font-semibold ${access === a ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {a === "admin" ? "Admin" : "Member"}
            </button>
          ))}
        </div>

        {access === "admin" && (
          <>
            <p className="text-[11px] font-semibold tracking-wider text-gray-500">FEATURES {person.display_name.toUpperCase()} CAN USE</p>
            <div>
              {visible.map((p) => {
                const on = perms.includes(p.key);
                return (
                  <button key={p.key} onClick={() => toggle(p.key)} className="w-full flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0 text-left">
                    <span className="flex-1 text-sm font-medium text-gray-900">{p.label}</span>
                    <span className={`w-[42px] h-6 rounded-full relative transition-colors ${on ? "bg-orange-700" : "bg-gray-300"}`} role="switch" aria-checked={on}>
                      <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${on ? "right-[3px]" : "left-[3px]"}`} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {iAmOwner ? "Only you, the Owner, can change another admin's access." : "Only the Owner can change an admin's access later."}
            </p>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-[#eadfd6] font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
        {(iAmOwner || person.access === "member") && (
          confirmRemove ? (
            <button onClick={remove} disabled={saving} className="w-full py-2.5 text-sm font-semibold text-red-700">Tap again to remove {person.display_name}</button>
          ) : (
            <button onClick={() => setConfirmRemove(true)} className="w-full py-2.5 text-sm font-semibold text-red-600">Remove from group</button>
          )
        )}
      </div>
    </div>
  );
}
