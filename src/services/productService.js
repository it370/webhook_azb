const { getSupabaseClient } = require("./supabaseClient");

const PRODUCT_SELECT = `
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
`;

async function listProducts({ limit = 100, status = "published" } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { products: [], error: "Supabase not configured" };

  const cappedLimit = Math.min(Math.max(limit, 1), 200);
  const query = supabase.from("product_catalog_view").select(PRODUCT_SELECT).order("name").limit(cappedLimit);
  if (status) {
    query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return { products: [], error: error.message };
  }

  return { products: data || [], error: null };
}

module.exports = { listProducts };

