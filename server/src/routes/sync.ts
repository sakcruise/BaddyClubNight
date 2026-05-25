import { Router } from "express";
import { supabaseSync } from "../services/supabaseSync.js";

export const syncRouter = Router();

syncRouter.post("/:sessionId", async (req, res, next) => {
  try {
    const synced_at = await supabaseSync(req.params.sessionId);
    res.json({ synced_at });
  } catch (err) {
    next(err);
  }
});
