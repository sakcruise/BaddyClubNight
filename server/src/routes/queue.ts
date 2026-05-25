import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const queueRouter = Router();
queueRouter.use(requireAuth);

function getQueue(sessionId: string) {
  return db
    .prepare(`
      SELECT qe.*, m.name, m.avatar_url, m.email
      FROM queue_entries qe
      JOIN members m ON m.id = qe.member_id
      WHERE qe.session_id = ?
      ORDER BY qe.position ASC
    `)
    .all(sessionId)
    .map((row: Record<string, unknown>) => ({
      member_id: row.member_id,
      position: row.position,
      checked_in_at: row.checked_in_at,
      member: {
        id: row.member_id,
        name: row.name,
        avatar_url: row.avatar_url,
        email: row.email,
        created_at: "",
      },
    }));
}

queueRouter.get("/:sessionId/queue", (req, res) => {
  const queue = getQueue(req.params.sessionId);
  res.json({ queue });
});

queueRouter.post("/:sessionId/queue/checkin", (req, res) => {
  const { session_id: _, ...__ } = req.body as { member_id: string; session_id?: string };
  const { member_id } = req.body as { member_id: string };
  const { sessionId } = req.params;

  const existing = db
    .prepare("SELECT * FROM queue_entries WHERE session_id = ? AND member_id = ?")
    .get(sessionId, member_id);
  if (existing) {
    res.status(409).json({ message: "Member already in queue" });
    return;
  }

  const maxPos = (db
    .prepare("SELECT MAX(position) as m FROM queue_entries WHERE session_id = ?")
    .get(sessionId) as { m: number | null }).m ?? 0;

  db.prepare(
    "INSERT INTO queue_entries (id, session_id, member_id, position) VALUES (?, ?, ?, ?)"
  ).run(uuid(), sessionId, member_id, maxPos + 1);

  res.json({ queue: getQueue(sessionId) });
});

queueRouter.delete("/:sessionId/queue/:memberId", (req, res) => {
  const { sessionId, memberId } = req.params;
  db.prepare("DELETE FROM queue_entries WHERE session_id = ? AND member_id = ?").run(sessionId, memberId);

  // Re-number remaining positions
  const remaining = db
    .prepare("SELECT id FROM queue_entries WHERE session_id = ? ORDER BY position")
    .all(sessionId) as { id: string }[];

  const update = db.prepare("UPDATE queue_entries SET position = ? WHERE id = ?");
  const tx = db.transaction(() => {
    remaining.forEach((row, i) => update.run(i + 1, row.id));
  });
  tx();

  res.json({ queue: getQueue(sessionId) });
});
