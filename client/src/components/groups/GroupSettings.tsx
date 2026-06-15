import { useState } from "react";
import { MapPin, Palette, ShoppingBag, Check } from "lucide-react";
import { useGroupStore, useSessionStore } from "../../store";
import { groupsApi } from "../../services/groups";
import { THEMES, applyTheme } from "../../styles/themes";
import type { ThemeKey } from "../../styles/themes";
import OfflineMode from "../shared/OfflineMode";

/**
 * Settings drawer for a friends-group session. A trimmed, group-appropriate
 * counterpart to ClubSettings — no fixed club-night day/time. Theme + venue
 * persist to Supabase via groupsApi; shuttle costs live in the local clubConfig
 * for now (the Splitwise expenses feature will formalise per-group costs later).
 */
export default function GroupSettings({ groupId }: { groupId: string }) {
  const group = useGroupStore((s) => s.groups.find((g) => g.id === groupId));
  const updateGroup = useGroupStore((s) => s.updateGroup);
  const { clubConfig, setClubConfig } = useSessionStore();

  const [venue, setVenue] = useState(group?.venue ?? "");
  const [tubePrice, setTubePrice] = useState(String(clubConfig?.shuttleTubePrice ?? 2.5));
  const [budgetTubes, setBudgetTubes] = useState(String(clubConfig?.shuttleBudgetTubes ?? 10));
  const [savingVenue, setSavingVenue] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  function flash(field: string) {
    setSavedField(field);
    setTimeout(() => setSavedField((f) => (f === field ? null : f)), 2000);
  }

  async function handleThemeChange(key: ThemeKey) {
    applyTheme(key);
    updateGroup(groupId, { themeKey: key });
    try {
      await groupsApi.update(groupId, { themeKey: key });
    } catch (e: any) {
      alert(`Couldn't save theme: ${e?.message ?? "unknown error"}`);
    }
  }

  async function handleSaveVenue() {
    setSavingVenue(true);
    try {
      updateGroup(groupId, { venue: venue.trim() });
      await groupsApi.update(groupId, { venue: venue.trim() });
      flash("venue");
    } catch (e: any) {
      alert(`Couldn't save venue: ${e?.message ?? "unknown error"}`);
    } finally {
      setSavingVenue(false);
    }
  }

  function handleSaveShuttles() {
    setClubConfig({
      shuttleTubePrice: parseFloat(tubePrice) || 0,
      shuttleBudgetTubes: parseInt(budgetTubes) || 0,
    });
    flash("shuttles");
  }

  const activeTheme = (group?.themeKey ?? "orange") as ThemeKey;

  return (
    <div className="flex flex-col gap-5">

      {/* Work Offline — always visible at top */}
      <OfflineMode />

      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-black text-gray-900">{group?.name ?? "Group"} Settings</h2>
        <p className="text-sm text-gray-400 font-body mt-0.5">
          Tune your group — venue, shuttle costs, and colour.
        </p>
      </div>

      {/* Venue */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-blue-600">
          <MapPin size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Default Venue</span>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Springfield Sports Centre, Court B"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-body text-sm
                       focus:outline-none focus:border-blue-400 w-full"
          />
          <button
            onClick={handleSaveVenue}
            disabled={savingVenue || venue.trim() === (group?.venue ?? "")}
            className={`self-end px-4 py-2 rounded-xl font-display font-black text-sm transition-all active:scale-95
              ${savedField === "venue"
                ? "bg-green-500 text-white"
                : venue.trim() !== (group?.venue ?? "")
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            {savedField === "venue" ? <><Check size={14} className="inline" /> Saved</> : savingVenue ? "Saving…" : "Save Venue"}
          </button>
        </div>
      </div>

      {/* Shuttle Costs */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-amber-600">
          <ShoppingBag size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Shuttle Costs</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Price per Tube (£)</label>
            <input
              type="number" min="0" step="0.10"
              value={tubePrice}
              onChange={(e) => setTubePrice(e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-display font-bold text-lg
                         focus:outline-none focus:border-amber-400 w-full"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-display font-bold text-gray-500 uppercase tracking-wider">Budget (tubes/night)</label>
            <input
              type="number" min="0" step="1"
              value={budgetTubes}
              onChange={(e) => setBudgetTubes(e.target.value)}
              className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-display font-bold text-lg
                         focus:outline-none focus:border-amber-400 w-full"
            />
          </div>
        </div>
        {tubePrice && budgetTubes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-display font-bold">
            🏸 Budget: {budgetTubes} tubes × £{(parseFloat(tubePrice) || 0).toFixed(2)} = £{((parseFloat(tubePrice) || 0) * (parseInt(budgetTubes) || 0)).toFixed(2)}/night
          </div>
        )}
        <button
          onClick={handleSaveShuttles}
          className={`self-end px-4 py-2 rounded-xl font-display font-black text-sm transition-all active:scale-95
            ${savedField === "shuttles" ? "bg-green-500 text-white" : "bg-amber-500 text-white hover:bg-amber-600"}`}
        >
          {savedField === "shuttles" ? <><Check size={14} className="inline" /> Saved</> : "Save Costs"}
        </button>
      </div>

      {/* Theme */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-purple-600">
          <Palette size={16} />
          <span className="font-display font-bold text-sm uppercase tracking-wider">Group Colour</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((theme) => {
            const isActive = activeTheme === theme.key;
            return (
              <button
                key={theme.key}
                onClick={() => handleThemeChange(theme.key as ThemeKey)}
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
    </div>
  );
}
