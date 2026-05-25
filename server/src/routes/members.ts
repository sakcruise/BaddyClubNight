import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const membersRouter = Router();
membersRouter.use(requireAuth);

const clubId = (req: any) => req.clubId as string;

membersRouter.get("/", (req, res) => {
  const members = db.prepare("SELECT * FROM members WHERE club_id = ? ORDER BY name").all(clubId(req));
  res.json({ members });
});

membersRouter.post("/", (req, res) => {
  const { name, email, member_type } = req.body as {
    name: string; email?: string; member_type?: "male" | "female" | "guest";
  };
  if (!name?.trim()) { res.status(400).json({ message: "Name is required" }); return; }
  const id = uuid();
  db.prepare(
    "INSERT INTO members (id, club_id, name, email, member_type) VALUES (?, ?, ?, ?, ?)"
  ).run(id, clubId(req), name.trim(), email ?? null, member_type ?? "male");
  const member = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
  res.status(201).json({ member });
});

membersRouter.patch("/:id", (req, res) => {
  const { name, member_type } = req.body as { name?: string; member_type?: "male" | "female" | "guest" };
  const { id } = req.params;
  if (name !== undefined) db.prepare("UPDATE members SET name = ? WHERE id = ? AND club_id = ?").run(name.trim(), id, clubId(req));
  if (member_type !== undefined) db.prepare("UPDATE members SET member_type = ? WHERE id = ? AND club_id = ?").run(member_type, id, clubId(req));
  const member = db.prepare("SELECT * FROM members WHERE id = ? AND club_id = ?").get(id, clubId(req));
  if (!member) { res.status(404).json({ message: "Member not found" }); return; }
  res.json({ member });
});

membersRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM queue_entries WHERE member_id = ?").run(id);
  db.prepare("DELETE FROM members WHERE id = ? AND club_id = ?").run(id, clubId(req));
  res.json({ ok: true });
});
