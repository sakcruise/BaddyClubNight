import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, HelpCircle, MapPin, Clock, LayoutGrid, MinusCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

type RsvpStatus = "yes" | "no" | "maybe" | "no_response";

interface SessionMember {
  id: string;
  name: string;
  member_type: "male" | "female" | "guest";
  rsvp: RsvpStatus;
}

interface SessionPage {
  id: string;
  group_name: string;
  scheduled_at: string;
  venue?: string;
  num_courts: number;
  status: string;
  members: SessionMember[];
}

const RSVP_ICON: Record<RsvpStatus, React.ReactNode> = {
  yes:         <CheckCircle2 size={16} className="text-green-500" />,
  no:          <XCircle      size={16} className="text-red-400"   />,
  maybe:       <HelpCircle   size={16} className="text-yellow-500"/>,
  no_response: <MinusCircle  size={16} className="text-gray-300"  />,
};

const RSVP_LABEL: Record<RsvpStatus, string> = {
  yes: "Going", no: "Can't make it", maybe: "Maybe", no_response: "No response",
};

const TYPE_DOT: Record<string, string> = {
  male: "bg-blue-500", female: "bg-pink-500", guest: "bg-purple-500",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function SessionRsvpView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]         = useState<SessionPage | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [picking, setPicking]   = useState<string | null>(null); // member id being updated
  const [saving, setSaving]     = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const { data: result, error: err } = await supabase.rpc("get_session_rsvp_page", { p_session_id: id });
      if (err) throw err;
      if (!result) { setError("Session not found"); return; }
      setData(result as SessionPage);
    } catch (e: any) {
      setError(e.message ?? "Failed to load session");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleRsvp(memberId: string, status: RsvpStatus) {
    if (status === "no_response") return;
    setSaving(memberId);
    try {
      const { error: err } = await supabase.rpc("rsvp_session", {
        p_session_id: id,
        p_member_id:  memberId,
        p_status:     status,
      });
      if (err) throw err;
      // Optimistically update local state
      setData((prev) => prev ? {
        ...prev,
        members: prev.members.map((m) => m.id === memberId ? { ...m, rsvp: status } : m),
      } : prev);
      setPicking(null);
    } catch (e: any) {
      alert(`Couldn't save RSVP: ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  const goingCount  = data?.members.filter((m) => m.rsvp === "yes").length  ?? 0;
  const maybeCount  = data?.members.filter((m) => m.rsvp === "maybe").length ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #581c87 0%, #7c3aed 60%, #a855f7 100%)" }}>
        <div className="w-9 h-9 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6"
        style={{ background: "linear-gradient(135deg, #581c87 0%, #7c3aed 60%, #a855f7 100%)" }}>
        <p className="text-white font-display font-black text-xl text-center">{error || "Session not found"}</p>
      </div>
    );
  }

  const { date, time } = formatDate(data.scheduled_at);

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, #581c87 0%, #7c3aed 60%, #a855f7 100%)" }}>

      {/* Header */}
      <div className="flex flex-col items-center gap-3 pt-10 pb-6 px-5">
        <div className="bg-white/15 rounded-2xl p-3 backdrop-blur-sm border border-white/20">
          <ShuttlecockIcon size={36} />
        </div>
        <h1 className="font-display font-black text-white text-2xl text-center">{data.group_name}</h1>
        <p className="text-purple-200 font-display font-semibold text-sm">Badminton Session</p>
      </div>

      <div className="flex-1 px-4 pb-10 max-w-sm w-full mx-auto flex flex-col gap-4">

        {/* Session details card */}
        <div className="bg-white rounded-2xl p-4 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Clock size={15} className="text-purple-600" />
              </div>
              <div>
                <p className="font-display font-black text-gray-900 text-sm">{date}</p>
                <p className="font-display font-bold text-purple-600 text-sm">{time}</p>
              </div>
            </div>
            {data.venue && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} className="text-purple-600" />
                </div>
                <p className="font-display font-bold text-gray-700 text-sm">{data.venue}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <LayoutGrid size={15} className="text-purple-600" />
              </div>
              <p className="font-display font-bold text-gray-700 text-sm">
                {data.num_courts} court{data.num_courts > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* RSVP summary */}
          {(goingCount > 0 || maybeCount > 0) && (
            <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
              {goingCount > 0 && (
                <span className="flex items-center gap-1 text-green-600 font-display font-black text-sm">
                  <CheckCircle2 size={14} /> {goingCount} going
                </span>
              )}
              {maybeCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-500 font-display font-black text-sm">
                  <HelpCircle size={14} /> {maybeCount} maybe
                </span>
              )}
            </div>
          )}
        </div>

        {/* Members + RSVP */}
        <div className="bg-white rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-display font-black text-gray-900 text-sm">
              Who's coming? <span className="text-gray-400 font-normal">— tap your name to update</span>
            </p>
          </div>

          {(data.members ?? []).map((m) => (
            <div key={m.id}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                onClick={() => setPicking(picking === m.id ? null : m.id)}
              >
                <span className={`w-8 h-8 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-sm flex-shrink-0`}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 font-display font-bold text-gray-800 text-sm">{m.name}</span>
                <span className="flex items-center gap-1.5 text-xs font-display font-bold text-gray-400">
                  {RSVP_ICON[m.rsvp]}
                  <span className={m.rsvp === "yes" ? "text-green-600" : m.rsvp === "no" ? "text-red-400" : m.rsvp === "maybe" ? "text-yellow-500" : "text-gray-300"}>
                    {RSVP_LABEL[m.rsvp]}
                  </span>
                </span>
              </button>

              {/* Inline RSVP picker */}
              {picking === m.id && (
                <div className="flex gap-2 px-4 py-2.5 bg-purple-50 border-b border-gray-100">
                  {(["yes", "maybe", "no"] as const).map((s) => {
                    const cfg = {
                      yes:   { icon: <CheckCircle2 size={14} />, label: "Going",  cls: "bg-green-500 text-white border-green-500"  },
                      maybe: { icon: <HelpCircle   size={14} />, label: "Maybe",  cls: "bg-yellow-400 text-white border-yellow-400" },
                      no:    { icon: <XCircle      size={14} />, label: "Can't",  cls: "bg-red-500 text-white border-red-500"       },
                    }[s];
                    const isActive = m.rsvp === s;
                    return (
                      <button key={s}
                        disabled={saving === m.id}
                        onClick={() => handleRsvp(m.id, s)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 font-display font-black text-xs transition-all active:scale-95 disabled:opacity-50
                          ${isActive ? cfg.cls : "border-gray-200 text-gray-500 bg-white"}`}>
                        {cfg.icon} {cfg.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-white/40 text-xs font-display pb-2">
          Tap your name to mark your attendance · No account needed
        </p>
      </div>
    </div>
  );
}
