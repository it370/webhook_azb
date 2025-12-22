const dotenv = require("dotenv");
dotenv.config();

const { getSupabaseClient } = require("../src/services/supabaseClient");

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const vendors = [
    { name: "City Bakery", veng_location: "Chanmari", phone_number: "700000001" },
    { name: "Aizawl Grocery", veng_location: "Zarkawt", phone_number: "700000002" },
    { name: "Mizo Mart", veng_location: "Bawngkawn", phone_number: "700000003" },
    { name: "Hilltop Foods", veng_location: "Khatla", phone_number: "700000004" },
    { name: "Valley Fresh", veng_location: "Thuampui", phone_number: "700000005" },
  ];

  // Fetch existing vendors by name to avoid requiring a unique constraint.
  const vendorNames = vendors.map((v) => v.name);
  const { data: existingVendors, error: fetchVendorError } = await supabase
    .from("vendors")
    .select("id, name")
    .in("name", vendorNames);

  if (fetchVendorError) {
    console.error("Failed to fetch vendors", fetchVendorError);
    process.exit(1);
  }

  const existingByName = new Map((existingVendors || []).map((v) => [v.name, v]));
  const toInsert = vendors.filter((v) => !existingByName.has(v.name));

  let inserted = [];
  if (toInsert.length) {
    const { data: insertedRows, error: insertVendorError } = await supabase
      .from("vendors")
      .insert(toInsert)
      .select();
    if (insertVendorError) {
      console.error("Failed to insert vendors", insertVendorError);
      process.exit(1);
    }
    inserted = insertedRows || [];
  }

  const vendorIds = [...existingByName.values(), ...inserted].map((v) => v.id);
  if (!vendorIds.length) {
    console.error("No vendors available after insert.");
    process.exit(1);
  }

  const categories = ["Bakery", "Beverage", "Snack", "Produce", "Personal Care"];
  const products = Array.from({ length: 100 }).map((_, idx) => {
    const vendorId = vendorIds[idx % vendorIds.length];
    const category = categories[idx % categories.length];
    return {
      name: `${category} Item ${idx + 1}`,
      price: 50 + (idx % 20) * 5,
      description: `Sample ${category.toLowerCase()} product ${idx + 1} for testing.`,
      stock_status: idx % 7 !== 0, // some out of stock
      vendor_id: vendorId,
    };
  });

  const { error: productError } = await supabase.from("products").upsert(products);
  if (productError) {
    console.error("Failed to insert products", productError);
    process.exit(1);
  }

  console.log("Seeded vendors and 100 products.");
  process.exit(0);
}

main();

