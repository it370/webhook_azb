const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
} else {
  console.warn("Supabase credentials missing. Product search will be empty.");
}

function getSupabaseClient() {
  return supabase;
}

module.exports = { getSupabaseClient };

