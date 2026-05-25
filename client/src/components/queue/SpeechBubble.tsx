import { motion, AnimatePresence } from "framer-motion";

const SHOUTS = [
  "Pick me! 🏸",
  "I'm ready!",
  "Choose me!",
  "Let's play! 🔥",
  "Pick me please!",
  "I'll smash it! 💪",
  "Over here! 👋",
  "On fire today! 🔥",
];

interface Props {
  visible: boolean;
  memberId: string;
}

export default function SpeechBubble({ visible, memberId }: Props) {
  const shout = SHOUTS[memberId.charCodeAt(0) % SHOUTS.length];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-10
                     bg-brand-500 text-white text-xs font-display font-bold
                     px-3 py-1.5 rounded-2xl whitespace-nowrap shadow-lg
                     pointer-events-none"
          initial={{ opacity: 0, y: 6, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {shout}
          {/* Tail */}
          <span
            className="absolute left-1/2 -translate-x-1/2 top-full
                       border-4 border-transparent border-t-brand-500"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
