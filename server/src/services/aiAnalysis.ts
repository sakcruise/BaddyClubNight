import Anthropic from "@anthropic-ai/sdk";

// Inline types (mirrors client types to avoid cross-package imports)
type PlayerStats = { name: string; wins: number; losses: number; matches: number };
type Match = { id: string; court_id: number; team_a: string[]; team_b: string[]; result: string };

const client = new Anthropic();

export async function analyseNight(
  stats: PlayerStats[],
  matches: Match[]
): Promise<{
  summary: string;
  highlights: string[];
  improvement_tips: Record<string, string>;
}> {
  const prompt = `You are a friendly badminton coach summarising tonight's club session.

Here are the player stats:
${JSON.stringify(stats, null, 2)}

Here are the matches:
${JSON.stringify(matches, null, 2)}

Please provide:
1. A warm, encouraging 2-sentence summary of the night
2. 3 match highlights (exciting moments, impressive performances)
3. One personalised improvement tip per player (use their name as the key)

Respond with valid JSON matching this shape:
{
  "summary": "...",
  "highlights": ["...", "...", "..."],
  "improvement_tips": { "Player Name": "tip" }
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response");

  return JSON.parse(jsonMatch[0]);
}
