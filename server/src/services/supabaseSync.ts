import { createClient } from "@supabase/supabase-js";
import db from "../db/index.js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function supabaseSync(sessionId: string): Promise<string> {
  const supabase = getSupabase();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  const members = db.prepare("SELECT * FROM members").all();
  const matches = db.prepare("SELECT * FROM matches WHERE session_id = ?").all(sessionId);
  const queue = db.prepare("SELECT * FROM queue_entries WHERE session_id = ?").all(sessionId);

  // Upsert all data to Supabase
  await Promise.all([
    supabase.from("sessions").upsert([session]),
    supabase.from("members").upsert(members),
    supabase.from("matches").upsert(matches),
    supabase.from("queue_entries").upsert(queue),
  ]);

  const synced_at = new Date().toISOString();
  return synced_at;
}
