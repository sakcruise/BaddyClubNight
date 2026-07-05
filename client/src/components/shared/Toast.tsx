import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ToastProps {
  message: string | null;
  onDone: () => void;
  type?: "error" | "info" | "success";
  duration?: number;
}

export function Toast({ message, onDone, type = "error", duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  const colours = {
    error:   "bg-red-500 text-white",
    info:    "bg-gray-800 text-white",
    success: "bg-green-500 text-white",
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl
            shadow-xl font-display font-bold text-sm text-center max-w-xs
            flex items-center gap-2 ${colours[type]}`}
        >
          {type === "error" && <span>⚠️</span>}
          {type === "success" && <span>✅</span>}
          {type === "info" && <span>ℹ️</span>}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
