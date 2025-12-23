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
    {
      name: "City Bakery",
      veng_location: "Chanmari",
      phone_number: "700000001",
      default_commission_percent: 5,
    },
    {
      name: "Aizawl Grocery",
      veng_location: "Zarkawt",
      phone_number: "700000002",
      default_commission_percent: 5,
    },
    {
      name: "Mizo Mart",
      veng_location: "Bawngkawn",
      phone_number: "700000003",
      default_commission_percent: 6.5,
    },
    {
      name: "Hilltop Foods",
      veng_location: "Khatla",
      phone_number: "700000004",
      default_commission_percent: 5,
    },
    {
      name: "Valley Fresh",
      veng_location: "Thuampui",
      phone_number: "700000005",
      default_commission_percent: 7,
    },
  ];

  const catalog = [
    {
      name: "Bakery",
      description: "Breads, cakes, cookies and breakfast bakes.",
      subcategories: ["Breads", "Cakes", "Cookies"],
      tags: ["fresh-bake", "breakfast", "snack"],
    },
    {
      name: "Beverage",
      description: "Tea, coffee, juices and bottled water.",
      subcategories: ["Tea & Coffee", "Juice", "Water"],
      tags: ["drink", "refreshing"],
    },
    {
      name: "Snack",
      description: "Chips, biscuits and quick bites.",
      subcategories: ["Chips", "Biscuits", "Nuts"],
      tags: ["snack", "on-the-go"],
    },
    {
      name: "Produce",
      description: "Fresh vegetables and fruits.",
      subcategories: ["Leafy Greens", "Root Vegetables", "Fruits"],
      tags: ["fresh", "local", "seasonal"],
    },
    {
      name: "Personal Care",
      description: "Essentials for hygiene and wellness.",
      subcategories: ["Bath & Body", "Hair Care", "Oral Care"],
      tags: ["care", "daily-use"],
    },
  ];

  const tagSet = new Set([
    "organic",
    "vegan",
    "gluten-free",
    "bundle",
    "family-pack",
    "local",
    "imported",
    ...catalog.flatMap((c) => c.tags),
  ]);

  // Upsert vendors
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
      .upsert(toInsert, { onConflict: "name" })
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

  // Upsert categories and subcategories
  const categoryPayload = catalog.map((c, idx) => ({
    slug: slugify(c.name),
    name: c.name,
    description: c.description,
    sort_order: idx,
  }));

  const { data: categoryRows, error: catError } = await supabase
    .from("categories")
    .upsert(categoryPayload, { onConflict: "slug" })
    .select();
  if (catError) {
    console.error("Failed to upsert categories", catError);
    process.exit(1);
  }

  const categoryBySlug = new Map((categoryRows || []).map((c) => [c.slug, c]));

  const subcategoryPayload = catalog.flatMap((cat) => {
    const categoryId = categoryBySlug.get(slugify(cat.name))?.id;
    return (cat.subcategories || []).map((sub, idx) => ({
      slug: slugify(`${cat.name}-${sub}`),
      name: sub,
      category_id: categoryId,
      sort_order: idx,
    }));
  });

  const { data: subcategoryRows, error: subCatError } = await supabase
    .from("subcategories")
    .upsert(subcategoryPayload, { onConflict: "slug" })
    .select();
  if (subCatError) {
    console.error("Failed to upsert subcategories", subCatError);
    process.exit(1);
  }

  const subcategoryBySlug = new Map((subcategoryRows || []).map((s) => [s.slug, s]));

  // Tags
  const tagsPayload = Array.from(tagSet).map((t) => ({
    slug: slugify(t),
    name: titleCase(t),
  }));
  const { data: tagRows, error: tagError } = await supabase
    .from("tags")
    .upsert(tagsPayload, { onConflict: "slug" })
    .select();
  if (tagError) {
    console.error("Failed to upsert tags", tagError);
    process.exit(1);
  }
  const tagBySlug = new Map((tagRows || []).map((t) => [t.slug, t]));

  // Build products with richer metadata
  const products = [];
  const productMeta = [];
  let counter = 1;

  for (const cat of catalog) {
    const categoryId = categoryBySlug.get(slugify(cat.name))?.id;
    for (const sub of cat.subcategories) {
      const subSlug = slugify(`${cat.name}-${sub}`);
      const subcategoryId = subcategoryBySlug.get(subSlug)?.id;
      for (let i = 0; i < 4; i += 1) {
        const name = `${sub} ${counter}`;
        const slug = slugify(`${sub}-${counter}`);
        const vendor_id = vendorIds[(counter - 1) % vendorIds.length];
        const baseTags = new Set([...cat.tags, sub.toLowerCase(), counter % 2 === 0 ? "organic" : "local"]);
        const tagSlugs = Array.from(baseTags).map((t) => slugify(t));
        const search_keywords = tagSlugs.join(" ");
        const description = `Fresh ${sub.toLowerCase()} from ${cat.name} category, great for daily use.`;
        const search_description = `${sub} made with quality ingredients, available in Aizawl. Ideal for quick purchase or gifting.`;

        products.push({
          name,
          slug,
          vendor_id,
          category_id: categoryId,
          subcategory_id: subcategoryId,
          status: "published",
          price: 40 + (counter % 10) * 5,
          currency_code: "INR",
          description,
          search_description,
          search_keywords,
          stock_status: counter % 7 !== 0,
          stock_quantity: 25 + (counter % 8) * 3,
          unit_label: "unit",
          package_size: "1 pack",
          cover_image_url: `https://placehold.co/640x640?text=${encodeURIComponent(name)}`,
          thumbnail_url: `https://placehold.co/200x200?text=${encodeURIComponent(name)}`,
          minified_image_url: `https://placehold.co/120x120?text=${encodeURIComponent(name)}`,
          hero_image_url: `https://placehold.co/960x540?text=${encodeURIComponent(name)}`,
          commission_percent: counter % 3 === 0 ? 6.5 : 5,
        });

        productMeta.push({
          slug,
          tagSlugs,
        });

        counter += 1;
      }
    }
  }

  const { data: insertedProducts, error: productError } = await supabase
    .from("products")
    .upsert(products, { onConflict: "slug,vendor_id" })
    .select();
  if (productError) {
    console.error("Failed to insert products", productError);
    process.exit(1);
  }

  const productIdBySlug = new Map((insertedProducts || []).map((p) => [p.slug, p.id]));

  // Link tags
  const productTags = [];
  for (const meta of productMeta) {
    const productId = productIdBySlug.get(meta.slug);
    if (!productId) continue;
    meta.tagSlugs.forEach((ts) => {
      const tagId = tagBySlug.get(ts)?.id;
      if (tagId) {
        productTags.push({ product_id: productId, tag_id: tagId });
      }
    });
  }

  if (productTags.length) {
    const { error: ptError } = await supabase
      .from("product_tags")
      .upsert(productTags, { onConflict: "product_id,tag_id" });
    if (ptError) {
      console.error("Failed to upsert product tags", ptError);
      process.exit(1);
    }
  }

  // Images table (store minified + thumbnail variants)
  const productImages = [];
  for (const p of insertedProducts || []) {
    productImages.push(
      {
        product_id: p.id,
        variant: "thumbnail",
        url: p.thumbnail_url,
        width: 200,
        height: 200,
      },
      {
        product_id: p.id,
        variant: "minified",
        url: p.minified_image_url,
        width: 120,
        height: 120,
      },
      {
        product_id: p.id,
        variant: "hero",
        url: p.hero_image_url,
        width: 960,
        height: 540,
      }
    );
  }

  if (productImages.length) {
    const { error: imgError } = await supabase.from("product_images").upsert(productImages, {
      onConflict: "product_id,variant",
    });
    if (imgError) {
      console.error("Failed to upsert product images", imgError);
      process.exit(1);
    }
  }

  console.log(
    `Seeded ${vendorIds.length} vendors, ${categoryPayload.length} categories, ${products.length} products with tags and images.`
  );
  process.exit(0);
}

function slugify(text = "") {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(text = "") {
  return text
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

main();

