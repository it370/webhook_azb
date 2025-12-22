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

async function findProductsBySimilarity(embedding, options = {}) {
  if (!supabase) return [];

  const matchCount = options.matchCount || 5;
  const similarityThreshold = options.similarityThreshold ?? 0.5;

  const { data, error } = await supabase.rpc("match_products", {
    query_embedding: embedding,
    match_threshold: similarityThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Supabase match_products failed", error);
    return [];
  }

  return data || [];
}

module.exports = { findProductsBySimilarity };

