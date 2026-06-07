import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://minhnhrdvgvlqajjcbph.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbmhuaHJkdmd2bHFhampjYnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcyNjg0MywiZXhwIjoyMDk1MzAyODQzfQ.O7YgsoxEzY0nt4RCEtxiHDJwBUDGG_igrScG_7BF4Dk"
);

// Test we can read matches
const { data, error } = await supabase.from("matches").select("id, shuttles_used").limit(1);
if (error && error.message.includes("shuttles_used")) {
  console.log("Column does not exist yet — run this SQL in Supabase dashboard:");
  console.log("\nALTER TABLE matches ADD COLUMN IF NOT EXISTS shuttles_used INTEGER;");
} else if (error) {
  console.error("Error:", error.message);
} else {
  console.log("✅ shuttles_used column already exists:", data);
}
