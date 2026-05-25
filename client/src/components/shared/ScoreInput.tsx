import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Delete } from "lucide-react";

interface Props {
  label?: string;
  value: number;
  onChange: (v: number) => void;
}

const ROWS = [["1","2","3"],["4","5","6"],["7","8","9"],["C","0","⌫"]];

function NumPad({ draft, onTap, onClose, anchorRect }: {
  draft: string;
  onTap: (k: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}) {
  // Position above the button, centred on it
  const padW = 160;
  const gap = 6;
  let left = anchorRect.left + anchorRect.width / 2 - padW / 2;
  // Clamp to viewport
  left = Math.max(8, Math.min(left, window.innerWidth - padW - 8));
  // Place above; if too close to top, flip below
  const spaceAbove = anchorRect.top - gap;
  const placeBelow = spaceAbove < 220;
  const top = placeBelow
    ? anchorRect.bottom + gap
    : undefined;
  const bottom = placeBelow
    ? undefined
    : window.innerHeight - anchorRect.top + gap;

  return createPortal(
    <>
      {/* Invisible close area */}
      <div className="fixed inset-0 z-[9997]" onClick={onClose} />

      {/* Numpad */}
      <div
        className="fixed z-[9998]"
        style={{ left, top, bottom, width: padW }}
      >
        <motion.div
          className="bg-white border-2 border-orange-300 rounded-2xl shadow-xl p-2 select-none"
          initial={{ opacity: 0, scale: 0.92, y: placeBelow ? -4 : 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.12 }}
        >
          {/* Current value */}
          <div className="text-center font-display font-black text-3xl text-gray-900 tabular-nums
                          bg-orange-50 rounded-xl py-1.5 mb-2 border border-orange-100">
            {draft}
          </div>

          {/* Digit grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {ROWS.flat().map((key) => (
              <button
                key={key}
                onClick={(e) => { e.stopPropagation(); onTap(key); }}
                className={`h-9 rounded-xl font-display font-bold text-base transition-all active:scale-90
                  ${key === "C"
                    ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    : key === "⌫"
                      ? "bg-red-50 text-red-500 hover:bg-red-100"
                      : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100"
                  }`}
              >
                {key === "⌫" ? <Delete size={14} className="mx-auto" /> : key}
              </button>
            ))}
          </div>

          {/* Done */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="mt-1.5 w-full py-2 rounded-xl bg-green-500 text-white font-display font-bold text-sm
                       hover:bg-green-600 active:scale-95 transition-all"
          >
            ✓ Done
          </button>
        </motion.div>
      </div>
    </>,
    document.body
  );
}

export default function ScoreInput({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function openPad() {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setDraft(String(value));
    setOpen(true);
  }

  function tap(key: string) {
    let next: string;
    if (key === "C") {
      next = "0";
    } else if (key === "⌫") {
      next = draft.length > 1 ? draft.slice(0, -1) : "0";
    } else {
      next = draft === "0" ? key : draft + key;
      if (next.length > 3) return;
    }
    setDraft(next);
    onChange(parseInt(next));
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[9px] font-display font-bold text-gray-400 uppercase tracking-wide text-center leading-none">
          {label}
        </span>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={() => { const v = Math.max(0, value - 1); onChange(v); setDraft(String(v)); }}
          className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 font-black text-sm
                     hover:bg-gray-200 active:scale-95 transition-all"
        >−</button>

        <button
          ref={btnRef}
          onClick={openPad}
          className={`w-12 h-8 rounded-xl font-display font-black text-xl text-gray-900 tabular-nums
                      border-2 transition-all active:scale-95
                      ${open ? "border-orange-500 bg-orange-50" : "border-orange-300 bg-white hover:border-orange-400"}`}
        >
          {value}
        </button>

        <button
          onClick={() => { const v = value + 1; onChange(v); setDraft(String(v)); }}
          className="w-6 h-6 rounded-lg bg-orange-500 text-white font-black text-sm
                     hover:bg-orange-600 active:scale-95 transition-all"
        >+</button>
      </div>

      <AnimatePresence>
        {open && anchorRect && (
          <NumPad
            draft={draft}
            onTap={tap}
            onClose={() => setOpen(false)}
            anchorRect={anchorRect}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
