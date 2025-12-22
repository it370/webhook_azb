const { getSupabaseClient } = require("./supabaseClient");

async function findProductsBySimilarity(embedding, options = {}) {
  const supabase = getSupabaseClient();
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

