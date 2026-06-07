import { motion, AnimatePresence } from "framer-motion";
import type { MemberType } from "../../types";

interface Props {
  memberType: MemberType;
  name: string;
  phase?: number; // 0=shouting 1=searching 2=tired-walking 3=facepalm-zzz
}

// ── Per-phase body motion ────────────────────────────────────────────────────

const bodyVariants: Record<number, import("framer-motion").AnimationProps["animate"]> = {
  0: { // Excited bounce + wiggle
    y:      [0, -7, 0, -4, 0],
    rotate: [-4, 4, -4, 4, 0],
    transition: { duration: 0.7, repeat: Infinity, repeatDelay: 0.15, ease: "easeInOut" },
  },
  1: { // Slow head-scan side to side
    rotate: [-10, 10, -10],
    x:      [-2, 2, -2],
    y:      [0, -1, 0],
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
  2: { // Tired shuffle walk
    x:      [-4, 4, -4],
    y:      [0, -2, 0, -1, 0],
    rotate: [-3, 1, -3],
    transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
  },
  3: { // Slumped snooze
    rotate: [0, -5, 0, -4, 0],
    y:      [0, 3, 0],
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
};

// ── Floating extras ───────────────────────────────────────────────────────────

function QuestionMarks() {
  return (
    <AnimatePresence>
      {[{ x: 48, delay: 0 }, { x: 56, delay: 0.5 }, { x: 40, delay: 1 }].map((p, i) => (
        <motion.text
          key={i}
          x={p.x} y={0}
          fontSize="10" fill="white" fontWeight="900" fontFamily="sans-serif"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: [0, 1, 1, 0], y: [10, -4, -14, -22] }}
          transition={{ duration: 2, repeat: Infinity, delay: p.delay, ease: "easeOut" }}
        >?</motion.text>
      ))}
    </AnimatePresence>
  );
}

function SweatDrops() {
  return (
    <>
      {[{ x: 50, y: 20, delay: 0 }, { x: 6, y: 24, delay: 0.6 }].map((p, i) => (
        <motion.ellipse
          key={i}
          cx={p.x} cy={p.y} rx="2" ry="3"
          fill="#93C5FD"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: [0, 0.9, 0], y: [-4, 6, 14] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </>
  );
}

function ZzzFloats() {
  return (
    <>
      {[
        { x: 52, fontSize: 9,  delay: 0   },
        { x: 58, fontSize: 11, delay: 0.9 },
        { x: 50, fontSize: 13, delay: 1.8 },
      ].map((p, i) => (
        <motion.text
          key={i}
          x={p.x} y={8}
          fontSize={p.fontSize} fill="#E0F2FE" fontWeight="900" fontFamily="sans-serif"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [8, -2, -12, -20], rotate: [0, 15, 25] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: p.delay, ease: "easeOut" }}
        >z</motion.text>
      ))}
    </>
  );
}

// ── Mouth shapes ─────────────────────────────────────────────────────────────

function MouthShouting() {
  return (
    <>
      <motion.ellipse cx="32" cy="41" rx="6" ry="5" fill="#1a0a00"
        animate={{ ry: [5, 7, 5, 6, 5] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} />
      <motion.rect x="27" y="39" width="10" height="4" rx="1" fill="white"
        animate={{ height: [4, 5, 4] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} />
      <motion.ellipse cx="32" cy="45" rx="3.5" ry="2.5" fill="#F87171"
        animate={{ cy: [45, 44, 45] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} />
    </>
  );
}

function MouthSearching() {
  // Flat line slightly open, shifts side to side
  return (
    <motion.path
      d="M26 42 Q32 40 38 42"
      stroke="#1a0a00" strokeWidth="2" fill="none" strokeLinecap="round"
      animate={{ d: ["M26 42 Q32 40 38 42", "M26 41 Q32 43 38 41", "M26 42 Q32 40 38 42"] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
  );
}

function MouthTired() {
  // Droopy frown
  return (
    <motion.path
      d="M26 43 Q32 47 38 43"
      stroke="#1a0a00" strokeWidth="2.5" fill="none" strokeLinecap="round"
      animate={{ d: ["M26 43 Q32 47 38 43", "M27 44 Q32 46 37 44", "M26 43 Q32 47 38 43"] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
  );
}

function MouthSnoring() {
  // Small "O" snore, opens and closes
  return (
    <motion.ellipse cx="32" cy="43" rx="3" ry="2" fill="#1a0a00"
      animate={{ ry: [2, 3, 2], rx: [3, 2, 3] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }} />
  );
}

// ── Eye shapes ────────────────────────────────────────────────────────────────

function EyesWide({ eyeColor }: { eyeColor: string }) {
  return (
    <>
      <ellipse cx="25" cy="26" rx="4" ry="4.5" fill="white" />
      <ellipse cx="39" cy="26" rx="4" ry="4.5" fill="white" />
      <motion.ellipse cx="25" cy="27" rx="2.5" ry="2.8" fill={eyeColor}
        animate={{ ry: [2.8, 0.6, 2.8] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 1.5 }} />
      <motion.ellipse cx="39" cy="27" rx="2.5" ry="2.8" fill={eyeColor}
        animate={{ ry: [2.8, 0.6, 2.8] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 1.5 }} />
      <ellipse cx="23.5" cy="25.5" rx="1" ry="1" fill="white" />
      <ellipse cx="37.5" cy="25.5" rx="1" ry="1" fill="white" />
    </>
  );
}

function EyesSearching({ eyeColor }: { eyeColor: string }) {
  // Pupils drift side to side
  return (
    <>
      <ellipse cx="25" cy="26" rx="4" ry="4.5" fill="white" />
      <ellipse cx="39" cy="26" rx="4" ry="4.5" fill="white" />
      <motion.ellipse cx="25" cy="27" rx="2.5" ry="2.8" fill={eyeColor}
        animate={{ cx: [23, 27, 23] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
      <motion.ellipse cx="39" cy="27" rx="2.5" ry="2.8" fill={eyeColor}
        animate={{ cx: [37, 41, 37] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
      <ellipse cx="23.5" cy="25.5" rx="1" ry="1" fill="white" />
      <ellipse cx="37.5" cy="25.5" rx="1" ry="1" fill="white" />
    </>
  );
}

function EyesTired({ eyeColor }: { eyeColor: string }) {
  // Heavy half-closed lids
  return (
    <>
      <ellipse cx="25" cy="26" rx="4" ry="4.5" fill="white" />
      <ellipse cx="39" cy="26" rx="4" ry="4.5" fill="white" />
      <ellipse cx="25" cy="27" rx="2.5" ry="2.2" fill={eyeColor} />
      <ellipse cx="39" cy="27" rx="2.5" ry="2.2" fill={eyeColor} />
      {/* Heavy droopy eyelids */}
      <motion.rect x="21" y="22" width="8" height="5" rx="2" fill="#FDDCB5"
        animate={{ height: [4, 6, 4] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      <motion.rect x="35" y="22" width="8" height="5" rx="2" fill="#FDDCB5"
        animate={{ height: [4, 6, 4] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
    </>
  );
}

function EyesClosed() {
  return (
    <>
      <path d="M21 26 Q25 23 29 26" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M35 26 Q39 23 43 26" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  );
}

// ── Facepalm arm ─────────────────────────────────────────────────────────────

function FacepalmArm({ skin, skinShade }: { skin: string; skinShade: string }) {
  return (
    <motion.g
      initial={{ opacity: 0, rotate: -30 }}
      animate={{ opacity: 1, rotate: [0, -4, 0] }}
      transition={{ opacity: { duration: 0.3 }, rotate: { duration: 2.8, repeat: Infinity, ease: "easeInOut" } }}
      style={{ transformOrigin: "32px 52px" }}
    >
      {/* Arm */}
      <rect x="20" y="48" width="9" height="18" rx="4.5" fill={skinShade} />
      {/* Hand covering face */}
      <ellipse cx="24" cy="35" rx="9" ry="7" fill={skin} />
      <ellipse cx="24" cy="34" rx="7" ry="5" fill={skinShade} opacity="0.5" />
      {/* Fingers */}
      {[18, 21, 24, 27, 30].map((x, i) => (
        <ellipse key={i} cx={x} cy="29" rx="2" ry="4" fill={skin} />
      ))}
    </motion.g>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ShoutingAvatar({ memberType, phase = 0 }: Props) {
  const isFemale = memberType === "female";

  const skin      = isFemale ? "#FDDCB5" : "#F5C88A";
  const skinShade = isFemale ? "#F0BC90" : "#E0A868";
  const hair      = isFemale ? "#7C3AED" : "#1E40AF";
  const hairDark  = isFemale ? "#5B21B6" : "#1E3A8A";
  const eyeColor  = isFemale ? "#7C3AED" : "#1E40AF";
  const cheek     = isFemale ? "#F9A8D4" : "#FCA5A5";

  const bodyAnim = bodyVariants[phase] ?? bodyVariants[0];

  return (
    <motion.div
      className="relative flex-shrink-0"
      style={{ width: 68, height: 76 }}
      animate={bodyAnim}
    >
      <svg viewBox="0 0 68 76" width="68" height="76" xmlns="http://www.w3.org/2000/svg" overflow="visible">

        {/* Floating extras */}
        {phase === 1 && <QuestionMarks />}
        {phase === 2 && <SweatDrops />}
        {phase === 3 && <ZzzFloats />}

        {/* Shadow */}
        <ellipse cx="34" cy="73" rx="14" ry="3" fill="rgba(0,0,0,0.15)" />

        {/* Neck */}
        <rect x="28" y="54" width="12" height="10" rx="4" fill={skinShade} />

        {/* Hair back */}
        {isFemale ? (
          <>
            <ellipse cx="34" cy="23" rx="19" ry="20" fill={hairDark} />
            <ellipse cx="9"  cy="36" rx="6" ry="9" fill={hair} transform="rotate(-15,9,36)" />
            <ellipse cx="59" cy="36" rx="6" ry="9" fill={hair} transform="rotate(15,59,36)" />
          </>
        ) : (
          <ellipse cx="34" cy="21" rx="18" ry="18" fill={hairDark} />
        )}

        {/* Head */}
        <ellipse cx="34" cy="32" rx="17" ry="19" fill={skin} />
        <ellipse cx="26" cy="27" rx="6" ry="8" fill="rgba(255,255,255,0.18)" />
        <ellipse cx="40" cy="40" rx="8" ry="6" fill={skinShade} opacity="0.5" />

        {/* Hair front */}
        {isFemale ? (
          <path d="M15 23 Q18 11 34 13 Q50 11 53 23 Q48 17 34 18 Q20 17 15 23Z" fill={hair} />
        ) : (
          <path d="M16 22 Q14 8 22 10 Q24 6 28 12 Q30 5 34 12 Q36 5 40 12 Q44 6 46 10 Q52 8 52 22 Q48 14 34 15 Q20 14 16 22Z" fill={hair} />
        )}

        {/* Ears */}
        <ellipse cx="17" cy="33" rx="3.5" ry="4.5" fill={skinShade} />
        <ellipse cx="51" cy="33" rx="3.5" ry="4.5" fill={skinShade} />
        <ellipse cx="17" cy="33" rx="2"   ry="3"   fill={skin} />
        <ellipse cx="51" cy="33" rx="2"   ry="3"   fill={skin} />

        {/* Eyebrows — droop more as phase increases */}
        {phase <= 1 ? (
          <>
            <path d="M21 21 Q25 17 29 20" stroke={hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M35 20 Q39 17 43 21" stroke={hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M21 22 Q25 20 29 22" stroke={hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M35 22 Q39 20 43 22" stroke={hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* Eyes */}
        {phase === 0 && <EyesWide eyeColor={eyeColor} />}
        {phase === 1 && <EyesSearching eyeColor={eyeColor} />}
        {phase === 2 && <EyesTired eyeColor={eyeColor} />}
        {phase === 3 && <EyesClosed />}

        {/* Cheeks */}
        <ellipse cx="19" cy="36" rx="5" ry="3" fill={cheek} opacity="0.5" />
        <ellipse cx="49" cy="36" rx="5" ry="3" fill={cheek} opacity="0.5" />

        {/* Nose */}
        <path d="M32 33 Q34 36 36 33" stroke={skinShade} strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Mouth */}
        {phase === 0 && <MouthShouting />}
        {phase === 1 && <MouthSearching />}
        {phase === 2 && <MouthTired />}
        {phase === 3 && <MouthSnoring />}

        {/* Facepalm arm (phase 3) */}
        {phase === 3 && <FacepalmArm skin={skin} skinShade={skinShade} />}

        {/* Energy lines (phase 0 only) */}
        {phase === 0 && (
          <motion.g
            animate={{ opacity: [1, 0.3, 1], scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            style={{ transformOrigin: "34px 34px" }}
          >
            <line x1="2"  y1="13" x2="9"  y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            <line x1="66" y1="13" x2="59" y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            <line x1="34" y1="2"  x2="34" y2="9"  stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            <line x1="4"  y1="34" x2="10" y2="34" stroke="white" strokeWidth="2"   strokeLinecap="round" opacity="0.5" />
            <line x1="64" y1="34" x2="58" y2="34" stroke="white" strokeWidth="2"   strokeLinecap="round" opacity="0.5" />
          </motion.g>
        )}

        {/* Tired shuffle feet (phase 2) */}
        {phase === 2 && (
          <motion.g animate={{ x: [-2, 2, -2] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
            <motion.ellipse cx="27" cy="65" rx="6" ry="3" fill={skinShade}
              animate={{ cx: [24, 28, 24] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }} />
            <motion.ellipse cx="41" cy="65" rx="6" ry="3" fill={skinShade}
              animate={{ cx: [44, 38, 44] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }} />
          </motion.g>
        )}
      </svg>
    </motion.div>
  );
}
