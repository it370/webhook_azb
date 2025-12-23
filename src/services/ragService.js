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
  pcv.id,
  pcv.name,
  pcv.price,
  pcv.description,
  pcv.search_description,
  pcv.stock_status,
  pcv.vendor_id,
  v.name as vendor_name,
  v.veng_location
from product_catalog_view pcv
left join vendors v on v.id = pcv.vendor_id
where pcv.status = 'published' and (
  pcv.name ilike '%${cleaned}%'
  or pcv.description ilike '%${cleaned}%'
  or pcv.search_description ilike '%${cleaned}%'
  or pcv.search_keywords ilike '%${cleaned}%'
)
limit ${limit};`;
  // console.log("[text-search] query:", cleaned, "limit:", limit);
  // console.log("[text-search] sql:", sqlPreview);

  const { data, error } = await supabase
    .from("product_catalog_view")
    .select(
      `
        id,
        name,
        price,
        description,
        search_description,
        stock_status,
        stock_quantity,
        vendor_id,
        vendor:vendors(name, veng_location),
        category_name,
        subcategory_name,
        tag_names,
        cover_image_url,
        thumbnail_url,
        minified_image_url,
        commission_percent,
        commission_fixed_amount
      `
    )
    .eq("status", "published")
    .or(
      [
        `name.ilike.%${cleaned}%`,
        `description.ilike.%${cleaned}%`,
        `search_description.ilike.%${cleaned}%`,
        `search_keywords.ilike.%${cleaned}%`,
      ].join(",")
    )
    .limit(limit);

  if (error) {
    console.error("Supabase text search failed", error);
    return [];
  }

  return data || [];
}

async function fetchPopularProducts(limit = 5) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("product_catalog_view")
    .select(
      `
        id,
        name,
        price,
        description,
        search_description,
        stock_status,
        stock_quantity,
        vendor_id,
        vendor:vendors(name, veng_location),
        category_name,
        subcategory_name,
        tag_names,
        cover_image_url,
        thumbnail_url,
        minified_image_url,
        commission_percent,
        commission_fixed_amount
      `
    )
    .eq("status", "published")
    .limit(limit);

  if (error) {
    console.error("Supabase popular products failed", error);
    return [];
  }

  return data || [];
}

module.exports = { findProductsBySimilarity, fetchPopularProducts };

