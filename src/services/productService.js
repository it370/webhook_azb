const { getSupabaseClient } = require("./supabaseClient");

async function listProducts({ limit = 100 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { products: [], error: "Supabase not configured" };

  const cappedLimit = Math.min(Math.max(limit, 1), 200);
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
    .limit(cappedLimit);

  if (error) {
    return { products: [], error: error.message };
  }

  return { products: data || [], error: null };
}

module.exports = { listProducts };

