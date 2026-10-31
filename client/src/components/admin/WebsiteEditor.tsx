import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import {
  Globe, ChevronDown, ChevronRight, Save, Plus, Trash2, Upload, Image,
  Type, Users, Calendar, CreditCard, Camera, MapPin, Loader2, Check, AlertCircle
} from "lucide-react";

type SectionData = Record<string, any>;
type Sections = Record<string, SectionData>;

const SECTION_META: { key: string; label: string; icon: typeof Globe; color: string }[] = [
  { key: "hero", label: "Hero Banner", icon: Type, color: "text-orange-600" },
  { key: "about", label: "About Us", icon: Users, color: "text-blue-600" },
  { key: "schedule", label: "Schedule", icon: Calendar, color: "text-green-600" },
  { key: "membership", label: "Membership", icon: CreditCard, color: "text-purple-600" },
  { key: "gallery", label: "Gallery", icon: Camera, color: "text-pink-600" },
  { key: "committee", label: "Committee", icon: Users, color: "text-amber-600" },
  { key: "contact", label: "Contact & Location", icon: MapPin, color: "text-teal-600" },
];

const inputCls = "border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-body focus:outline-none focus:border-orange-400 w-full transition-colors";
const textareaCls = `${inputCls} resize-none`;
const smallBtnCls = "flex items-center gap-1 text-xs font-display font-bold px-3 py-1.5 rounded-xl transition-colors";

export default function WebsiteEditor() {
  const [sections, setSections] = useState<Sections>({});
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ section: string; type: "ok" | "err"; msg: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("site_content").select("section, content");
      if (!error && data) {
        const map: Sections = {};
        data.forEach((r: any) => { map[r.section] = r.content; });
        setSections(map);
      }
      setLoading(false);
    })();
  }, []);

  function update(section: string, path: string, value: any) {
    setSections((prev) => {
      const s = { ...prev };
      const obj = { ...s[section] };
      const keys = path.split(".");
      let cur: any = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      s[section] = obj;
      return s;
    });
  }

  function updateArrayItem(section: string, arrPath: string, index: number, field: string, value: any) {
    setSections((prev) => {
      const s = { ...prev };
      const obj = { ...s[section] };
      const arr = [...(arrPath.split(".").reduce((o: any, k) => o[k], obj) as any[])];
      arr[index] = { ...arr[index], [field]: value };
      const keys = arrPath.split(".");
      let cur: any = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = arr;
      s[section] = obj;
      return s;
    });
  }

  function addArrayItem(section: string, arrPath: string, template: any) {
    setSections((prev) => {
      const s = { ...prev };
      const obj = { ...s[section] };
      const keys = arrPath.split(".");
      let cur: any = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = [...(cur[keys[keys.length - 1]] || []), template];
      s[section] = obj;
      return s;
    });
  }

  function removeArrayItem(section: string, arrPath: string, index: number) {
    setSections((prev) => {
      const s = { ...prev };
      const obj = { ...s[section] };
      const keys = arrPath.split(".");
      let cur: any = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      const arr = [...(cur[keys[keys.length - 1]] as any[])];
      arr.splice(index, 1);
      cur[keys[keys.length - 1]] = arr;
      s[section] = obj;
      return s;
    });
  }

  async function handleSave(section: string) {
    setSaving(section);
    setFeedback(null);
    const { error } = await supabase
      .from("site_content")
      .update({ content: sections[section], updated_at: new Date().toISOString() })
      .eq("section", section);
    setSaving(null);
    if (error) {
      setFeedback({ section, type: "err", msg: error.message });
    } else {
      setFeedback({ section, type: "ok", msg: "Saved!" });
      setTimeout(() => setFeedback((f) => f?.section === section ? null : f), 2500);
    }
  }

  async function handleImageUpload(section: string, index: number, file: File) {
    setUploading(`${section}-${index}`);
    const ext = file.name.split(".").pop();
    const path = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("website-images").upload(path, file, { upsert: true });
    if (error) {
      setFeedback({ section, type: "err", msg: `Upload failed: ${error.message}` });
      setUploading(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("website-images").getPublicUrl(path);
    updateArrayItem(section, "cards", index, "image_url", urlData.publicUrl);
    setUploading(null);
  }

  function toggle(key: string) {
    setOpenSection((prev) => (prev === key ? null : key));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" />
        <span className="font-display font-bold text-sm">Loading website content…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Globe size={18} className="text-orange-600" />
          <h2 className="text-xl font-display font-black text-gray-900">Website Editor</h2>
        </div>
        <p className="text-sm text-gray-400 font-body">
          Edit your Rivermead website content. Changes go live instantly.
        </p>
      </div>

      {SECTION_META.map(({ key, label, icon: Icon, color }) => {
        const isOpen = openSection === key;
        const data = sections[key] || {};
        return (
          <div key={key} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <Icon size={16} className={color} />
              <span className="font-display font-bold text-sm flex-1">{label}</span>
              {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="px-5 pb-5 flex flex-col gap-4 border-t border-gray-100 pt-4">
                {key === "hero" && <HeroEditor data={data} onChange={(p, v) => update("hero", p, v)} />}
                {key === "about" && <AboutEditor data={data} onChange={(p, v) => update("about", p, v)} onArrayChange={(i, f, v) => updateArrayItem("about", "cards", i, f, v)} onAddBadge={() => addArrayItem("about", "badges", "New badge")} onRemoveBadge={(i) => removeArrayItem("about", "badges", i)} onUpdateBadge={(i, v) => { const badges = [...(data.badges || [])]; badges[i] = v; update("about", "badges", badges); }} onAddCard={() => addArrayItem("about", "cards", { emoji: "🏸", title: "", text: "" })} onRemoveCard={(i) => removeArrayItem("about", "cards", i)} />}
                {key === "schedule" && <ScheduleEditor data={data} onChange={(p, v) => update("schedule", p, v)} onArrayChange={(i, f, v) => updateArrayItem("schedule", "sessions", i, f, v)} onAdd={() => addArrayItem("schedule", "sessions", { day: "Tuesday", time: "", type: "", level: "All" })} onRemove={(i) => removeArrayItem("schedule", "sessions", i)} />}
                {key === "membership" && <MembershipEditor data={data} onChange={(p, v) => update("membership", p, v)} onPlanChange={(i, f, v) => updateArrayItem("membership", "plans", i, f, v)} onAddFeature={(pi) => { const plans = [...(data.plans || [])]; plans[pi] = { ...plans[pi], features: [...(plans[pi].features || []), ""] }; update("membership", "plans", plans); }} onRemoveFeature={(pi, fi) => { const plans = [...(data.plans || [])]; plans[pi] = { ...plans[pi], features: plans[pi].features.filter((_: any, j: number) => j !== fi) }; update("membership", "plans", plans); }} onUpdateFeature={(pi, fi, v) => { const plans = [...(data.plans || [])]; const feats = [...plans[pi].features]; feats[fi] = v; plans[pi] = { ...plans[pi], features: feats }; update("membership", "plans", plans); }} />}
                {key === "gallery" && <GalleryEditor data={data} onArrayChange={(i, f, v) => updateArrayItem("gallery", "cards", i, f, v)} onAdd={() => addArrayItem("gallery", "cards", { tag: "", title: "", emoji: "🏸", color_from: "rgba(5,46,22,0.85)", color_to: "rgba(22,101,52,0.8)" })} onRemove={(i) => removeArrayItem("gallery", "cards", i)} onUpload={(i, f) => handleImageUpload("gallery", i, f)} uploading={uploading} />}
                {key === "committee" && <CommitteeEditor data={data} onChange={(p, v) => update("committee", p, v)} onMemberChange={(i, f, v) => updateArrayItem("committee", "members", i, f, v)} onAdd={() => addArrayItem("committee", "members", { name: "", role: "", initial: "" })} onRemove={(i) => removeArrayItem("committee", "members", i)} />}
                {key === "contact" && <ContactEditor data={data} onChange={(p, v) => update("contact", p, v)} />}

                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleSave(key)}
                    disabled={saving === key}
                    className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-display font-bold text-sm px-5 py-2.5 rounded-2xl shadow-lg shadow-orange-500/20 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 transition-all active:scale-95"
                  >
                    {saving === key ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {saving === key ? "Saving…" : "Save Section"}
                  </button>
                  {feedback?.section === key && (
                    <span className={`flex items-center gap-1 text-xs font-display font-bold ${feedback.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                      {feedback.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}
                      {feedback.msg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      {multiline ? (
        <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className={textareaCls} />
      ) : (
        <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
      )}
    </div>
  );
}

function HeroEditor({ data, onChange }: { data: SectionData; onChange: (path: string, value: any) => void }) {
  return (
    <>
      <Field label="Title Line 1" value={data.title_line1} onChange={(v) => onChange("title_line1", v)} placeholder="Rivermead" />
      <Field label="Title Line 2" value={data.title_line2} onChange={(v) => onChange("title_line2", v)} placeholder="Badminton Club" />
      <Field label="Tag Line" value={data.tag} onChange={(v) => onChange("tag", v)} placeholder="Reading, Berkshire · Welcoming All Levels" />
      <Field label="Subtitle" value={data.subtitle} onChange={(v) => onChange("subtitle", v)} multiline placeholder="A friendly, welcoming badminton club…" />
      <div className="flex flex-col gap-2">
        <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Stats</label>
        {(data.stats || []).map((stat: any, i: number) => (
          <div key={i} className="flex gap-2">
            <input type="text" value={stat.value} onChange={(e) => { const stats = [...data.stats]; stats[i] = { ...stats[i], value: e.target.value }; onChange("stats", stats); }} placeholder="Value" className={`${inputCls} w-24`} />
            <input type="text" value={stat.label} onChange={(e) => { const stats = [...data.stats]; stats[i] = { ...stats[i], label: e.target.value }; onChange("stats", stats); }} placeholder="Label" className={`${inputCls} flex-1`} />
          </div>
        ))}
      </div>
    </>
  );
}

function AboutEditor({ data, onChange, onArrayChange, onAddBadge, onRemoveBadge, onUpdateBadge, onAddCard, onRemoveCard }: {
  data: SectionData; onChange: (path: string, value: any) => void;
  onArrayChange: (index: number, field: string, value: any) => void;
  onAddBadge: () => void; onRemoveBadge: (i: number) => void; onUpdateBadge: (i: number, v: string) => void;
  onAddCard: () => void; onRemoveCard: (i: number) => void;
}) {
  return (
    <>
      <Field label="Heading" value={data.heading} onChange={(v) => onChange("heading", v)} />
      <Field label="Paragraph 1" value={data.paragraph1} onChange={(v) => onChange("paragraph1", v)} multiline />
      <Field label="Paragraph 2" value={data.paragraph2} onChange={(v) => onChange("paragraph2", v)} multiline />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Badges</label>
          <button onClick={onAddBadge} className={`${smallBtnCls} text-orange-600 bg-orange-50 hover:bg-orange-100`}><Plus size={12} /> Add</button>
        </div>
        {(data.badges || []).map((badge: string, i: number) => (
          <div key={i} className="flex gap-2">
            <input type="text" value={badge} onChange={(e) => onUpdateBadge(i, e.target.value)} className={`${inputCls} flex-1`} />
            <button onClick={() => onRemoveBadge(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Feature Cards</label>
          <button onClick={onAddCard} className={`${smallBtnCls} text-orange-600 bg-orange-50 hover:bg-orange-100`}><Plus size={12} /> Add</button>
        </div>
        {(data.cards || []).map((card: any, i: number) => (
          <div key={i} className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2 border border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-lg">{card.emoji}</span>
              <button onClick={() => onRemoveCard(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            </div>
            <div className="flex gap-2">
              <input type="text" value={card.emoji || ""} onChange={(e) => onArrayChange(i, "emoji", e.target.value)} placeholder="Emoji" className={`${inputCls} w-16`} />
              <input type="text" value={card.title || ""} onChange={(e) => onArrayChange(i, "title", e.target.value)} placeholder="Title" className={`${inputCls} flex-1`} />
            </div>
            <textarea value={card.text || ""} onChange={(e) => onArrayChange(i, "text", e.target.value)} placeholder="Description" rows={2} className={textareaCls} />
          </div>
        ))}
      </div>
    </>
  );
}

function ScheduleEditor({ data, onChange, onArrayChange, onAdd, onRemove }: {
  data: SectionData; onChange: (path: string, value: any) => void;
  onArrayChange: (index: number, field: string, value: any) => void;
  onAdd: () => void; onRemove: (i: number) => void;
}) {
  return (
    <>
      <Field label="Heading" value={data.heading} onChange={(v) => onChange("heading", v)} />
      <Field label="Description" value={data.description} onChange={(v) => onChange("description", v)} multiline />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Sessions</label>
          <button onClick={onAdd} className={`${smallBtnCls} text-green-600 bg-green-50 hover:bg-green-100`}><Plus size={12} /> Add Session</button>
        </div>
        {(data.sessions || []).map((sess: any, i: number) => (
          <div key={i} className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2 border border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold text-gray-400">Session {i + 1}</span>
              <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Day</label>
                <select value={sess.day || ""} onChange={(e) => onArrayChange(i, "day", e.target.value)} className={inputCls}>
                  {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Time</label>
                <input type="text" value={sess.time || ""} onChange={(e) => onArrayChange(i, "time", e.target.value)} placeholder="7:50 to 10:00 pm" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Type</label>
                <input type="text" value={sess.type || ""} onChange={(e) => onArrayChange(i, "type", e.target.value)} placeholder="Club Night" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Level</label>
                <input type="text" value={sess.level || ""} onChange={(e) => onArrayChange(i, "level", e.target.value)} placeholder="All" className={inputCls} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MembershipEditor({ data, onChange, onPlanChange, onAddFeature, onRemoveFeature, onUpdateFeature }: {
  data: SectionData; onChange: (path: string, value: any) => void;
  onPlanChange: (index: number, field: string, value: any) => void;
  onAddFeature: (planIndex: number) => void;
  onRemoveFeature: (planIndex: number, featIndex: number) => void;
  onUpdateFeature: (planIndex: number, featIndex: number, value: string) => void;
}) {
  return (
    <>
      <Field label="Heading" value={data.heading} onChange={(v) => onChange("heading", v)} />
      <Field label="Description" value={data.description} onChange={(v) => onChange("description", v)} multiline />

      {(data.plans || []).map((plan: any, pi: number) => (
        <div key={pi} className={`rounded-2xl p-4 flex flex-col gap-3 border ${plan.featured ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-100"}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{plan.emoji}</span>
            <span className="font-display font-bold text-sm text-gray-900">{plan.name || "Plan"}</span>
            {plan.featured && <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-bold">Featured</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Name</label>
              <input type="text" value={plan.name || ""} onChange={(e) => onPlanChange(pi, "name", e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Emoji</label>
              <input type="text" value={plan.emoji || ""} onChange={(e) => onPlanChange(pi, "emoji", e.target.value)} className={`${inputCls} w-16`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Price (£)</label>
              <input type="text" value={plan.price || ""} onChange={(e) => onPlanChange(pi, "price", e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Period</label>
              <input type="text" value={plan.period || ""} onChange={(e) => onPlanChange(pi, "period", e.target.value)} placeholder="quarter / night" className={inputCls} />
            </div>
          </div>
          <Field label="Description" value={plan.description} onChange={(v) => onPlanChange(pi, "description", v)} multiline />
          <Field label="Payment Note" value={plan.payment_note} onChange={(v) => onPlanChange(pi, "payment_note", v)} multiline />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Features</label>
              <button onClick={() => onAddFeature(pi)} className={`${smallBtnCls} text-purple-600 bg-purple-50 hover:bg-purple-100`}><Plus size={12} /> Add</button>
            </div>
            {(plan.features || []).map((feat: string, fi: number) => (
              <div key={fi} className="flex gap-2">
                <input type="text" value={feat} onChange={(e) => onUpdateFeature(pi, fi, e.target.value)} className={`${inputCls} flex-1`} />
                <button onClick={() => onRemoveFeature(pi, fi)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function GalleryEditor({ data, onArrayChange, onAdd, onRemove, onUpload, uploading }: {
  data: SectionData;
  onArrayChange: (index: number, field: string, value: any) => void;
  onAdd: () => void; onRemove: (i: number) => void;
  onUpload: (index: number, file: File) => void;
  uploading: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Gallery Cards</label>
        <button onClick={onAdd} className={`${smallBtnCls} text-pink-600 bg-pink-50 hover:bg-pink-100`}><Plus size={12} /> Add Card</button>
      </div>
      {(data.cards || []).map((card: any, i: number) => (
        <div key={i} className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-lg">{card.emoji} <span className="text-xs text-gray-400 font-display">{card.title || `Card ${i + 1}`}</span></span>
            <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Emoji</label>
              <input type="text" value={card.emoji || ""} onChange={(e) => onArrayChange(i, "emoji", e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Tag</label>
              <input type="text" value={card.tag || ""} onChange={(e) => onArrayChange(i, "tag", e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Tall?</label>
              <select value={card.tall ? "yes" : "no"} onChange={(e) => onArrayChange(i, "tall", e.target.value === "yes")} className={inputCls}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
          <Field label="Title" value={card.title} onChange={(v) => onArrayChange(i, "title", v)} />
          <Field label="Text" value={card.text} onChange={(v) => onArrayChange(i, "text", v)} multiline />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Photo</label>
            {card.image_url && (
              <div className="relative w-full h-24 rounded-xl overflow-hidden mb-1">
                <img src={card.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <label className={`${smallBtnCls} text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer justify-center`}>
              {uploading === `gallery-${i}` ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading === `gallery-${i}` ? "Uploading…" : card.image_url ? "Replace Photo" : "Upload Photo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(i, e.target.files[0]); }} />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommitteeEditor({ data, onChange, onMemberChange, onAdd, onRemove }: {
  data: SectionData; onChange: (path: string, value: any) => void;
  onMemberChange: (index: number, field: string, value: any) => void;
  onAdd: () => void; onRemove: (i: number) => void;
}) {
  return (
    <>
      <Field label="Heading" value={data.heading} onChange={(v) => onChange("heading", v)} />
      <Field label="Description" value={data.description} onChange={(v) => onChange("description", v)} multiline />
      <Field label="Contact Email" value={data.email} onChange={(v) => onChange("email", v)} placeholder="club@email.com" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Members</label>
          <button onClick={onAdd} className={`${smallBtnCls} text-amber-600 bg-amber-50 hover:bg-amber-100`}><Plus size={12} /> Add Member</button>
        </div>
        {(data.members || []).map((member: any, i: number) => (
          <div key={i} className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-display font-bold text-sm">
                {member.initial || member.name?.charAt(0) || "?"}
              </div>
              <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Name</label>
                <input type="text" value={member.name || ""} onChange={(e) => onMemberChange(i, "name", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Initial</label>
                <input type="text" value={member.initial || ""} onChange={(e) => onMemberChange(i, "initial", e.target.value)} className={`${inputCls} w-16`} maxLength={2} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Role</label>
                <input type="text" value={member.role || ""} onChange={(e) => onMemberChange(i, "role", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Subtitle (optional)</label>
              <input type="text" value={member.subtitle || ""} onChange={(e) => onMemberChange(i, "subtitle", e.target.value)} placeholder="e.g. Senior Member" className={inputCls} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ContactEditor({ data, onChange }: { data: SectionData; onChange: (path: string, value: any) => void }) {
  return (
    <>
      <Field label="Address Line 1" value={data.address_line1} onChange={(v) => onChange("address_line1", v)} placeholder="Rivermead Leisure Centre" />
      <Field label="Address Line 2" value={data.address_line2} onChange={(v) => onChange("address_line2", v)} placeholder="Richfield Avenue" />
      <Field label="Address Line 3" value={data.address_line3} onChange={(v) => onChange("address_line3", v)} placeholder="Reading, RG1 8EQ" />
      <Field label="Parking Info" value={data.parking} onChange={(v) => onChange("parking", v)} multiline />
      <Field label="Google Maps Embed URL" value={data.map_embed} onChange={(v) => onChange("map_embed", v)} placeholder="https://www.google.com/maps/embed?..." />
    </>
  );
}
