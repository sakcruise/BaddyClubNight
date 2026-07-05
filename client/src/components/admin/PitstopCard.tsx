import { motion } from "framer-motion";
import { X, ArrowLeftRight, Play } from "lucide-react";
import Avatar from "../shared/Avatar";
import type { Member, PitstopState } from "../../types";

interface Props {
  ps: PitstopState;
  idx: number;
  members: Record<string, Member>;
  freeCourt: number | null;
  launching?: boolean;
  selectedPlayerId?: string;      // player selected in THIS card for swap
  isSwapTarget?: boolean;         // another card has a selection — show swap buttons here
  onSelectPlayer: (id: string) => void;
  onSwapTeam: (id: string) => void;
  onRemove: () => void;
  onLaunch: () => void;
}

export default function PitstopCard({
  ps, idx, members, freeCourt, launching,
  selectedPlayerId, isSwapTarget, onSelectPlayer, onSwapTeam, onRemove, onLaunch,
}: Props) {
  const teamA = ps.players.filter((id) => ps.pairs[id] === "A");
  const teamB = ps.players.filter((id) => ps.pairs[id] === "B");
  const isSwapMode = !!selectedPlayerId || !!isSwapTarget;

  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded-2xl border-2 px-3 py-2.5 flex flex-col gap-2 flex-shrink-0 transition-colors
        ${isSwapMode ? "border-violet-400 bg-violet-50" : "border-yellow-300 bg-yellow-50"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏎️</span>
          <div>
            <div className={`font-display font-black text-sm ${isSwapMode ? "text-violet-900" : "text-yellow-900"}`}>
              Pitstop {idx + 1} {idx === 0 ? "· Next up" : "· On deck"}
            </div>
            <div className={`text-[10px] font-display font-semibold ${isSwapMode ? "text-violet-600" : "text-yellow-600"}`}>
              {isSwapMode ? "👆 Tap another player to swap" : "Tap player to replace · ⇄ to swap team"}
            </div>
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-yellow-200 text-yellow-600 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Teams */}
      <div className="flex gap-1.5">
        {(["A", "B"] as const).map((team) => {
          const teamIds = team === "A" ? teamA : teamB;
          return (
            <div key={team} className={`flex-1 rounded-xl px-2 py-1.5 min-w-0
              ${team === "A" ? "bg-blue-100" : "bg-orange-100"}`}>
              <div className={`text-[9px] font-display font-black mb-1.5
                ${team === "A" ? "text-blue-600" : "text-orange-600"}`}>
                Team {team}
              </div>
              <div className="flex flex-col gap-1">
                {teamIds.map((id) => {
                  const m = members[id];
                  const isSelected = selectedPlayerId === id;
                  return (
                    <div key={id} className={`flex items-center gap-1 rounded-lg border-2 bg-white transition-all
                      ${isSelected
                        ? "border-violet-500 bg-violet-50 ring-2 ring-violet-300"
                        : isSwapTarget
                          ? "border-violet-300 hover:border-violet-500"
                          : team === "A" ? "border-blue-200" : "border-orange-200"}`}
                    >
                      {/* Player row — tap to select / swap */}
                      <button
                        onClick={() => onSelectPlayer(id)}
                        className="flex items-center gap-1.5 flex-1 p-1.5 text-left min-w-0"
                      >
                        <Avatar name={m?.name ?? id} memberType={m?.member_type} size="sm" />
                        <span className="font-display font-bold text-xs text-gray-800 truncate">
                          {m?.name?.split(" ")[0] ?? id}
                        </span>
                        {isSelected && <span className="text-[9px] text-violet-600 font-bold ml-auto flex-shrink-0">selected</span>}
                        {isSwapTarget && !isSelected && (
                          <span className="text-[9px] text-violet-500 font-bold ml-auto flex-shrink-0 bg-violet-100 px-1.5 py-0.5 rounded-md">↕ swap</span>
                        )}
                      </button>
                      {/* Team swap button — hide in swap-target mode to avoid confusion */}
                      {!isSwapTarget && (
                        <button
                          onClick={() => onSwapTeam(id)}
                          title="Switch team"
                          className={`p-1.5 flex-shrink-0 rounded-r-lg transition-colors
                            ${team === "A" ? "hover:bg-blue-100 text-blue-400" : "hover:bg-orange-100 text-orange-400"}`}
                        >
                          <ArrowLeftRight size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Go button */}
      <button
        onClick={onLaunch}
        disabled={!freeCourt || launching}
        className={`w-full py-2.5 rounded-xl font-display font-black text-sm flex items-center justify-center gap-2
          transition-all active:scale-95
          ${freeCourt
            ? "bg-gradient-to-r from-green-500 to-green-400 text-white shadow-md shadow-green-500/30 hover:from-green-600 hover:to-green-500"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
      >
        <Play size={14} />
        {launching ? "Starting…" : freeCourt ? `Go! → Court ${freeCourt}` : "No free court"}
      </button>
    </motion.div>
  );
}
