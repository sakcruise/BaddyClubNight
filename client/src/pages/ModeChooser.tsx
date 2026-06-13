import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Users } from "lucide-react";
import { useGroupStore } from "../store";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import type { AppMode } from "../store";

/**
 * First-run chooser: is this account for a club, or for casual play with friends?
 * The choice is persisted (group-store) and can be changed later from either home.
 */
export default function ModeChooser() {
  const navigate = useNavigate();
  const setAppMode = useGroupStore((s) => s.setAppMode);

  function choose(mode: AppMode, to: string) {
    setAppMode(mode);
    navigate(to, { replace: true });
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 gap-8 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}
    >
      <div className="text-center">
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="inline-block mb-4"
        >
          <ShuttlecockIcon size={72} />
        </motion.div>
        <h1 className="text-white font-display font-black text-3xl leading-tight mb-1">How will you play?</h1>
        <p className="text-orange-200 text-sm font-display font-semibold">You can switch anytime</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => choose("club", "/")}
          className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/30">
            <Building2 size={26} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-black text-gray-900 text-lg">Run a Club</div>
            <div className="text-gray-500 text-sm font-display">Fixed venue & night, permanent roster, many courts</div>
          </div>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => choose("friends", "/groups")}
          className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/30">
            <Users size={26} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-black text-gray-900 text-lg">Play with Friends</div>
            <div className="text-gray-500 text-sm font-display">Casual groups, play any day, split the costs</div>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
