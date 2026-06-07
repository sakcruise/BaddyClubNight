import { Reorder, AnimatePresence, motion, useDragControls } from "framer-motion";
import { useQueueStore, useSessionStore } from "../../store";
import Avatar from "../shared/Avatar";
import { getCandidates } from "../../utils/queueLogic";
import { Users, GripVertical } from "lucide-react";
import { queueApi } from "../../services/api";
import type { QueuePosition } from "../../types";

function DragHandle({ controls }: { controls: ReturnType<typeof useDragControls> }) {
  return (
    <span
      className="touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-orange-400 flex-shrink-0 select-none p-1 -ml-1"
      onPointerDown={(e) => controls.start(e)}
    >
      <GripVertical size={20} />
    </span>
  );
}

function QueueItem({ entry, idx }: { entry: QueuePosition; idx: number }) {
  const controls = useDragControls();

  if (idx === 0) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-2xl border border-orange-300/50"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-50)), rgb(var(--p-100)))",
          boxShadow: "0 2px 12px rgba(234,88,12,0.12)",
        }}
      >
        <div className="queue-number bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/30 text-base font-black">
          1
        </div>
        <Avatar name={entry.member.name} url={entry.member.avatar_url} memberType={entry.member.member_type} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-black text-gray-900 text-base leading-tight truncate">
            {entry.member.name}
          </div>
          <div className="text-orange-500 text-xs font-display font-bold">Up next ✨</div>
        </div>
      </div>
    );
  }

  return (
    <Reorder.Item
      key={entry.member_id}
      value={entry}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white hover:bg-orange-50/60 transition-colors border border-transparent hover:border-orange-100/60"
      style={{ listStyle: "none" }}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10, backgroundColor: "rgb(var(--p-50))" }}
    >
      <DragHandle controls={controls} />
      <div className="queue-number bg-gray-100 text-gray-500 text-sm font-bold flex-shrink-0">
        {entry.position}
      </div>
      <Avatar name={entry.member.name} url={entry.member.avatar_url} memberType={entry.member.member_type} size="sm" />
      <span className="font-display font-bold text-gray-800 text-sm flex-1 truncate">
        {entry.member.name}
      </span>
    </Reorder.Item>
  );
}

export default function QueueList() {
  const { queue, activeMemberIds, openPicker, reorderQueue } = useQueueStore();
  const { courts, session } = useSessionStore();

  const firstInQueue = queue[0];
  const idleCourt = courts.find((c) => c.status === "idle");

  function handleStartPick() {
    if (!firstInQueue || !idleCourt) return;
    const candidates = getCandidates(queue, firstInQueue.member_id, activeMemberIds);
    openPicker(firstInQueue.member_id, candidates, idleCourt.id);
  }

  function handleReorder(newTail: QueuePosition[]) {
    const merged = firstInQueue ? [firstInQueue, ...newTail] : newTail;
    reorderQueue(merged);
    if (session?.id) {
      queueApi.reorder(session.id, merged.map((q) => q.member_id)).catch(console.error);
    }
  }

  return (
    <div className="flex flex-col h-full gap-4 min-h-0">

      {/* Section header */}
      <div className="section-header">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Users size={18} className="text-orange-600" />
        </div>
        <span className="section-title">Waiting Queue</span>
        <span className="ml-auto badge bg-orange-100 text-orange-600 text-xs">
          {queue.length} waiting
        </span>
      </div>

      {/* Start match CTA */}
      <AnimatePresence>
        {firstInQueue && idleCourt && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={handleStartPick}
            className="w-full py-4 px-5 rounded-2xl text-white font-display font-black text-base
                       text-left flex items-center gap-3 active:scale-95 transition-all duration-150
                       border border-orange-400/30"
            style={{
              background: "linear-gradient(135deg, rgb(var(--p-700)) 0%, rgb(var(--p-600)) 50%, rgb(var(--p-500)) 100%)",
              boxShadow: "0 4px 20px rgba(234,88,12,0.35), 0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            <span className="text-2xl">🏸</span>
            <div className="flex-1 min-w-0">
              <div className="text-white/80 text-xs font-bold mb-0.5">Court {idleCourt.id} is free!</div>
              <div className="truncate">{firstInQueue.member.name}, pick your team</div>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-1.5 text-sm font-bold flex-shrink-0">
              Go →
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Queue entries */}
      <motion.div layoutScroll className="flex-1 overflow-y-auto min-h-0 pr-1">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-4xl">🏸</span>
            <p className="text-gray-400 font-display font-bold text-sm">Nobody queued yet!</p>
          </div>
        ) : (
          <>
            {/* First item — locked, not draggable */}
            {firstInQueue && (
              <motion.div layout key={firstInQueue.member_id} className="mb-2">
                <QueueItem entry={firstInQueue} idx={0}  />
              </motion.div>
            )}

            {/* Rest — reorderable */}
            {queue.length > 1 && (
              <Reorder.Group
                axis="y"
                values={queue.slice(1)}
                onReorder={handleReorder}
                className="space-y-2"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
              >
                {queue.slice(1).map((entry, i) => (
                  <QueueItem key={entry.member_id} entry={entry} idx={i + 1}  />
                ))}
              </Reorder.Group>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
