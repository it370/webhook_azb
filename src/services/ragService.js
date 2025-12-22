const { getSupabaseClient } = require("./supabaseClient");

async function findProductsBySimilarity(embedding, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const matchCount = options.matchCount || 5;
  const similarityThreshold = options.similarityThreshold ?? 0.5;
  const queryText = options.queryText || "";

  // If no embedding (e.g., OpenAI key missing) go straight to text search.
  if (!embedding || !Array.isArray(embedding)) {
    return queryText ? searchByText(supabase, queryText, matchCount) : [];
  }

  const { data, error } = await supabase.rpc("match_products", {
    query_embedding: embedding,
    match_threshold: similarityThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Supabase match_products failed", error);
    return queryText ? searchByText(supabase, queryText, matchCount) : [];
  }

  if (data?.length) {
    return data;
  }

  // Fallback to simple text search when RPC results are empty.
  if (queryText) {
    return searchByText(supabase, queryText, matchCount);
  }

  return data || [];
}

async function searchByText(supabase, queryText, limit = 5) {
  const cleaned = queryText.trim().slice(0, 120);
  if (!cleaned) return [];

  // Log the search query for debugging against Supabase.
  const sqlPreview = `select
  p.id,
  p.name,
  p.price,
  p.description,
  p.stock_status,
  p.vendor_id,
  v.name as vendor_name,
  v.veng_location
from products p
left join vendors v on v.id = p.vendor_id
where p.name ilike '%${cleaned}%' or p.description ilike '%${cleaned}%'
limit ${limit};`;
  console.log("[text-search] query:", cleaned, "limit:", limit);
  console.log("[text-search] sql:", sqlPreview);

  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        price,
        description,
        stock_status,
        vendor_id,
        vendor:vendors(name, veng_location)
      `
    )
    .or(`name.ilike.%${cleaned}%,description.ilike.%${cleaned}%`)
    .limit(limit);

  if (error) {
    console.error("Supabase text search failed", error);
    return [];
  }

  return data || [];
}

module.exports = { findProductsBySimilarity };

