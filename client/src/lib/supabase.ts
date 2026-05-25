import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://minhnhrdvgvlqajjcbph.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H8XJmKqpfPoFtoNFxnl7kA_oHOklkrW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
