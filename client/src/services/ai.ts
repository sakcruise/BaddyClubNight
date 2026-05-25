import type { PlayerStats, Match } from "../types";

interface AIAnalysis {
  summary: string;
  highlights: string[];
  improvement_tips: Record<string, string>;
}

export async function analyseNight(
  stats: PlayerStats[],
  matches: Match[]
): Promise<AIAnalysis> {
  const res = await fetch("/api/ai/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stats, matches }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "AI analysis failed");
  }

  return res.json() as Promise<AIAnalysis>;
}
