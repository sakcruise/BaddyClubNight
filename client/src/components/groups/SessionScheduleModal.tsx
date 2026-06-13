import { useState } from "react";
import { X, MapPin, Clock, LayoutGrid } from "lucide-react";

interface Props {
  defaultVenue?: string;
  defaultCourts?: number;
  defaultDatetime?: string;
  editMode?: boolean;
  onConfirm: (data: { scheduled_at: string; venue: string; num_courts: number; startNow: boolean }) => void;
  onClose: () => void;
  busy?: boolean;
}

function nextSlot() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function SessionScheduleModal({ defaultVenue = "", defaultCourts = 1, defaultDatetime, editMode = false, onConfirm, onClose, busy }: Props) {
  const [startNow, setStartNow]     = useState(!editMode);
  const [datetime, setDatetime]     = useState(defaultDatetime ?? nextSlot);
  const [venue, setVenue]           = useState(defaultVenue);
  const [courts, setCourts]         = useState(defaultCourts);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const scheduled_at = startNow ? new Date().toISOString() : new Date(datetime).toISOString();
    onConfirm({ scheduled_at, venue, num_courts: courts, startNow });
  }

  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-purple-400 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-gray-900 text-lg">{editMode ? "Edit Session" : "Session Details"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          {/* Start now toggle — hidden in edit mode */}
          {!editMode && (
            <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
              <div>
                <p className="font-display font-black text-gray-900 text-sm">Start right now</p>
                <p className="text-gray-400 text-xs font-display mt-0.5">Or schedule for later</p>
              </div>
              <button
                type="button"
                onClick={() => setStartNow((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${startNow ? "bg-purple-500" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${startNow ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
          )}

          {/* Date & time — shown when scheduling for later, or always in edit mode */}
          {(editMode || !startNow) && (
            <div>
              <label className="text-xs font-display font-bold text-gray-600 mb-1 flex items-center gap-1.5">
                <Clock size={12} /> Date & Time
              </label>
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                required={editMode || !startNow}
                min={new Date().toISOString().slice(0, 16)}
                className={inputCls}
              />
            </div>
          )}

          {/* Venue */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 flex items-center gap-1.5">
              <MapPin size={12} /> Venue / Location
            </label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Rivermead Leisure Centre"
              className={inputCls}
            />
          </div>

          {/* Courts */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 flex items-center gap-1.5">
              <LayoutGrid size={12} /> Number of Courts
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCourts((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 font-display font-black text-gray-700 text-lg hover:bg-gray-200 transition-all">−</button>
              <span className="flex-1 text-center font-display font-black text-gray-900 text-xl">{courts}</span>
              <button type="button" onClick={() => setCourts((c) => Math.min(20, c + 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 font-display font-black text-gray-700 text-lg hover:bg-gray-200 transition-all">+</button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-purple-500/20 mt-1"
          >
            {busy ? (editMode ? "Saving…" : "Creating…") : editMode ? "Save Changes" : startNow ? "Start Session 🏸" : "Schedule Session 📅"}
          </button>
        </form>
      </div>
    </div>
  );
}
