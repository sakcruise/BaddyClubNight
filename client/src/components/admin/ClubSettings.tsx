import { useState } from "react";
import { useSessionStore } from "../../store";
import { MapPin, Clock, MessageCircle, Building2, Check, Palette, ShoppingBag } from "lucide-react";
import { THEMES, applyTheme } from "../../styles/themes";
import type { ThemeKey } from "../../styles/themes";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function timeLabel(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function ClubSettings() {
  const { clubConfig, setClubConfig } = useSessionStore();

  const [form, setForm] = useState({ ...clubConfig });
  const [saved, setSaved] = useState(false);

  function handleChange(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  function handleSave() {
    setClubConfig(form);
    applyTheme(((form as any).themeKey ?? "orange") as ThemeKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(clubConfig);

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-black text-gray-900">Club Settings</h2>
        <p className="text-sm text-gray-400 font-body mt-0.5">
          Your club profile — shown to members and used each session night.
        </p>
      </div>

      {/* Club Name */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-orange-600">
          <Building2 size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Club Identity</span>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
            Club Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g. Smash Club"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-display font-bold text-lg
                       focus:outline-none focus:border-orange-400 w-full"
          />
        </div>
      </div>

      {/* Venue */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-blue-600">
          <MapPin size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Venue</span>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
            Location / Sports Centre
          </label>
          <input
            type="text"
            value={form.venue}
            onChange={(e) => handleChange("venue", e.target.value)}
            placeholder="e.g. Springfield Sports Centre, Court B"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-body text-sm
                       focus:outline-none focus:border-blue-400 w-full"
          />
        </div>
      </div>

      {/* Night & Timings */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-green-600">
          <Clock size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Club Night</span>
        </div>

        {/* Day picker */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
            Regular Night
          </label>
          <div className="grid grid-cols-4 gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => handleChange("nightDay", day)}
                className={`py-2 rounded-xl text-xs font-display font-bold transition-all border-2
                  ${form.nightDay === day
                    ? "bg-green-500 text-white border-green-500 shadow-sm"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:border-green-300"
                  }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              Start Time
            </label>
            <input
              type="time"
              value={form.nightStart}
              onChange={(e) => handleChange("nightStart", e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-body text-sm
                         focus:outline-none focus:border-green-400 w-full"
            />
            <p className="text-xs text-gray-400 font-display font-semibold">{timeLabel(form.nightStart)}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              End Time
            </label>
            <input
              type="time"
              value={form.nightEnd}
              onChange={(e) => handleChange("nightEnd", e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-body text-sm
                         focus:outline-none focus:border-green-400 w-full"
            />
            <p className="text-xs text-gray-400 font-display font-semibold">{timeLabel(form.nightEnd)}</p>
          </div>
        </div>

        {/* Preview */}
        {form.nightDay && form.nightStart && form.nightEnd && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-800 font-display font-bold">
            🏸 {form.nightDay}s · {timeLabel(form.nightStart)} – {timeLabel(form.nightEnd)}
          </div>
        )}
      </div>

      {/* WhatsApp / Contact */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-green-500">
          <MessageCircle size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Contact</span>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
            WhatsApp Group Link or Phone
          </label>
          <input
            type="text"
            value={form.whatsapp}
            onChange={(e) => handleChange("whatsapp", e.target.value)}
            placeholder="https://chat.whatsapp.com/... or +44 7700 000000"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-body text-sm
                       focus:outline-none focus:border-green-400 w-full"
          />
        </div>
        {form.whatsapp && (
          <a
            href={form.whatsapp.startsWith("http") ? form.whatsapp : `https://wa.me/${form.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-green-600 font-display font-bold hover:underline"
          >
            <MessageCircle size={14} /> Open WhatsApp →
          </a>
        )}
      </div>

      {/* Shuttle Costs */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-amber-600">
          <ShoppingBag size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Shuttle Costs</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              Price per Tube (£)
            </label>
            <input
              type="number"
              min="0"
              step="0.10"
              value={(form as any).shuttleTubePrice ?? 2.50}
              onChange={(e) => handleChange("shuttleTubePrice" as any, e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-display font-bold text-lg
                         focus:outline-none focus:border-amber-400 w-full"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">
              Budget (tubes/night)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={(form as any).shuttleBudgetTubes ?? 10}
              onChange={(e) => handleChange("shuttleBudgetTubes" as any, e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-display font-bold text-lg
                         focus:outline-none focus:border-amber-400 w-full"
            />
          </div>
        </div>
        {(form as any).shuttleTubePrice && (form as any).shuttleBudgetTubes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-display font-bold">
            🏸 Budget: {(form as any).shuttleBudgetTubes} tubes × £{parseFloat((form as any).shuttleTubePrice).toFixed(2)} = £{(parseFloat((form as any).shuttleTubePrice) * parseInt((form as any).shuttleBudgetTubes)).toFixed(2)}/night
          </div>
        )}
      </div>

      {/* Theme */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-orange-600">
          <Palette size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Club Colour Theme</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((theme) => {
            const isActive = (form as any).themeKey === theme.key || (!((form as any).themeKey) && theme.key === "orange");
            return (
              <button
                key={theme.key}
                onClick={() => {
                    handleChange("themeKey" as any, theme.key);
                    applyTheme(theme.key as ThemeKey);
                  }}
                className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl border-2 transition-all
                  ${isActive ? "border-gray-800 bg-gray-50 shadow-sm" : "border-gray-100 hover:border-gray-300"}`}
              >
                <span className="text-2xl">{theme.emoji}</span>
                <span className="text-[10px] font-display font-bold text-gray-600">{theme.name}</span>
                {isActive && <span className="text-[9px] font-black text-gray-800">✓ Active</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!hasChanges && !saved}
        className={`w-full py-4 rounded-2xl font-display font-black text-base
          transition-all active:scale-95 flex items-center justify-center gap-2
          ${saved
            ? "bg-green-500 text-white"
            : hasChanges
              ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/25"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
      >
        {saved ? (
          <><Check size={18} /> Saved!</>
        ) : (
          "Save Settings"
        )}
      </button>
    </div>
  );
}
