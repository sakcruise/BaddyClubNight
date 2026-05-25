import { Router } from "express";
import { analyseNight } from "../services/aiAnalysis.js";

export const aiRouter = Router();

aiRouter.post("/analyse", async (req, res, next) => {
  try {
    const { stats, matches } = req.body;
    const analysis = await analyseNight(stats, matches);
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});
