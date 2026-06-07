import { Router } from "express";
import { supabaseSync, pullMembersFromSupabase } from "../services/supabaseSync.js";
import { requireAuth } from "../middleware/auth.js";

export const syncRouter = Router();
syncRouter.use(requireAuth);

// Push a completed session to Supabase
syncRouter.post("/:sessionId", async (req, res, next) => {
  try {
    const synced_at = await supabaseSync(req.params.sessionId);
    res.json({ synced_at });
  } catch (err) {
    next(err);
  }
});

// Pull members from Supabase into local SQLite (one-time import)
syncRouter.post("/pull/members", async (req: any, res, next) => {
  try {
    const count = await pullMembersFromSupabase(req.clubId as string);
    res.json({ imported: count });
  } catch (err) {
    next(err);
  }
});
