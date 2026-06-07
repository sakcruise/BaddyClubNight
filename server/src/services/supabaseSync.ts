import { createClient } from "@supabase/supabase-js";
import db from "../db/index.js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server .env");
  return createClient(url, key);
}

export async function pullMembersFromSupabase(clubId: string): Promise<number> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .neq("member_type", "guest");

  if (error) throw new Error(error.message);
  const members = data ?? [];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO members (id, club_id, name, email, avatar_url, member_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const m of members) {
      insert.run(m.id, clubId, m.name, m.email ?? null, m.avatar_url ?? null, m.member_type ?? "male");
    }
  });
  tx();

  return members.length;
}

export async function supabaseSync(sessionId: string): Promise<string> {
  const supabase = getSupabase();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
  if (!session) throw new Error("Session not found");

  const clubId = session.club_id;
  const members = db.prepare("SELECT * FROM members WHERE club_id = ?").all(clubId);
  const matches = db.prepare("SELECT * FROM matches WHERE session_id = ?").all(sessionId);
  const queue   = db.prepare("SELECT * FROM queue_entries WHERE session_id = ?").all(sessionId);

  const results = await Promise.allSettled([
    supabase.from("members").upsert(members, { onConflict: "id" }),
    supabase.from("sessions").upsert([session], { onConflict: "id" }),
    supabase.from("matches").upsert(matches, { onConflict: "id" }),
    supabase.from("queue_entries").upsert(queue, { onConflict: "id" }),
  ]);

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);
  if (errors.length) throw new Error(errors[0]?.message ?? "Sync failed");

  // Stamp synced_at locally
  const synced_at = new Date().toISOString();
  db.prepare("UPDATE sessions SET synced_at = ? WHERE id = ?").run(synced_at, sessionId);

  return synced_at;
}
