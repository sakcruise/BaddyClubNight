import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, SkipForward } from "lucide-react";

const TOUR_KEY = "baddy_tour_v1";

type Step = {
  title: string;
  body: string;
  emoji: string;
  // Which panel to spotlight on desktop (CSS selector hint for position)
  position: "center" | "left" | "center-top" | "center-bottom" | "right";
  mobileTab?: string;
};

const STEPS: Step[] = [
  {
    title: "Welcome to Club Night! 🏸",
    body: "Quick 60-second tour — tap Next to walk through the key bits.",
    emoji: "👋",
    position: "center",
  },
  {
    title: "Queue Panel",
    body: "Players check in as they arrive and automatically join the queue in order.",
    emoji: "📋",
    position: "left",
    mobileTab: "queue",
  },
  {
    title: "Courts",
    body: "Tap GO on a free court → pick 4 players → Start Match. That's it!",
    emoji: "🟢",
    position: "center-top",
    mobileTab: "courts",
  },
  {
    title: "Check-in Grid",
    body: "Tap any member avatar to check them in or out of tonight's session.",
    emoji: "✅",
    position: "center-bottom",
    mobileTab: "checkins",
  },
  {
    title: "Leaderboard",
    body: "Live win/loss stats update after every match result is recorded.",
    emoji: "🏆",
    position: "right",
    mobileTab: "leaderboard",
  },
  {
    title: "You're all set!",
    body: "Use Members to manage your roster and Settings to configure your club.",
    emoji: "🎉",
    position: "center",
  },
];

// Spotlight regions for desktop (% of viewport)
const SPOTLIGHT: Record<Step["position"], { top: string; left: string; width: string; height: string }> = {
  center:        { top: "0%",   left: "0%",    width: "100%", height: "100%" },
  left:          { top: "8%",   left: "0%",    width: "25%",  height: "92%" },
  "center-top":  { top: "8%",   left: "25%",   width: "50%",  height: "52%" },
  "center-bottom":{ top: "60%", left: "25%",   width: "50%",  height: "40%" },
  right:         { top: "8%",   left: "75%",   width: "25%",  height: "92%" },
};

// Where the callout bubble appears relative to the spotlight
const BUBBLE_POS: Record<Step["position"], { top: string; left: string; transform: string }> = {
  center:         { top: "50%",  left: "50%",  transform: "translate(-50%, -50%)" },
  left:           { top: "40%",  left: "28%",  transform: "translateY(-50%)" },
  "center-top":   { top: "30%",  left: "50%",  transform: "translate(-50%, -50%)" },
  "center-bottom":{ top: "72%",  left: "50%",  transform: "translate(-50%, -50%)" },
  right:          { top: "40%",  left: "50%",  transform: "translate(-50%, -50%)" },
};

interface Props {
  onTabChange?: (tab: string) => void;
}

export default function OnboardingTour({ onTabChange }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY);
    if (!done) {
      // Small delay so the layout renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const current = STEPS[step];

  function advance() {
    if (step < STEPS.length - 1) {
      const next = STEPS[step + 1];
      if (isMobile && next.mobileTab && onTabChange) onTabChange(next.mobileTab);
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    localStorage.setItem(TOUR_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const spot = !isMobile ? SPOTLIGHT[current.position] : SPOTLIGHT["center"];
  const bpos = !isMobile ? BUBBLE_POS[current.position] : BUBBLE_POS["center"];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Dark overlay with cutout spotlight */}
          <svg className="absolute inset-0 w-full h-full pointer-events-auto" style={{ cursor: "default" }}>
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                {current.position !== "center" && (
                  <rect
                    x={spot.left}
                    y={spot.top}
                    width={spot.width}
                    height={spot.height}
                    fill="black"
                    rx="12"
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.55)"
              mask={current.position !== "center" ? "url(#spotlight-mask)" : undefined}
            />
          </svg>

          {/* Callout bubble */}
          <motion.div
            key={step}
            className="absolute pointer-events-auto"
            style={{ ...bpos, maxWidth: "320px", width: "calc(100% - 48px)" }}
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-orange-100 overflow-hidden">
              {/* Top accent bar */}
              <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #c2410c, #f59e0b)" }} />

              <div className="p-5">
                {/* Step dots */}
                <div className="flex items-center gap-1.5 mb-3">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all"
                      style={{
                        width: i === step ? 16 : 6,
                        height: 6,
                        background: i === step ? "#ea580c" : i < step ? "#fdba74" : "#e5e7eb",
                      }}
                    />
                  ))}
                  <span className="ml-auto text-[10px] text-gray-400 font-display font-bold">
                    {step + 1}/{STEPS.length}
                  </span>
                </div>

                <div className="text-3xl mb-2 leading-none">{current.emoji}</div>
                <h3 className="font-display font-black text-gray-900 text-base mb-1">{current.title}</h3>
                <p className="text-gray-600 text-sm leading-snug">{current.body}</p>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={dismiss}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-display font-bold
                      text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    <SkipForward size={13} /> Skip
                  </button>
                  <button
                    onClick={advance}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl
                      text-sm font-display font-black text-white transition-all active:scale-95"
                    style={{ background: "linear-gradient(135deg, #c2410c, #ea580c)" }}
                  >
                    {isLast ? "Done! Let's go 🏸" : (
                      <>Next <ChevronRight size={15} /></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Close button top-right */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 pointer-events-auto p-2 rounded-full bg-white/20
              hover:bg-white/30 text-white backdrop-blur-sm transition-all"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
