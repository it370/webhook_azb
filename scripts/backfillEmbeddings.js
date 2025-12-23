const dotenv = require("dotenv");
dotenv.config();

const OpenAI = require("openai");
const { getSupabaseClient } = require("../src/services/supabaseClient");

const BATCH_SIZE = 50;
const MODEL = "text-embedding-3-small";

async function main() {
  const supabase = getSupabaseClient();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!supabase) {
    console.error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing. Cannot generate embeddings.");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  let totalUpdated = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, name, description, search_description, search_keywords")
      .is("embedding", null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Failed to fetch products needing embeddings", error);
      process.exit(1);
    }

    if (!rows || !rows.length) {
      console.log(`Done. Updated ${totalUpdated} products.`);
      process.exit(0);
    }

    console.log(`Embedding batch of ${rows.length}...`);

    for (const row of rows) {
      const text = buildEmbeddingText(row).slice(0, 2000);
      if (!text) continue;

      try {
        const resp = await client.embeddings.create({
          model: MODEL,
          input: text,
        });
        const embedding = resp.data?.[0]?.embedding;
        if (!embedding) {
          console.warn("No embedding returned for product", row.id);
          continue;
        }

        // Persist embedding both in the dedicated embeddings table and on products for compatibility.
        const { error: upsertError } = await supabase
          .from("product_embeddings")
          .upsert(
            {
              product_id: row.id,
              model: MODEL,
              source_text: text,
              embedding,
            },
            { onConflict: "product_id" }
          );

        if (upsertError) {
          console.error("Failed to upsert product_embeddings for", row.id, upsertError);
          continue;
        }

        const { error: updateError } = await supabase
          .from("products")
          .update({
            embedding,
            embedding_model: MODEL,
            embedding_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) {
          console.error("Failed to update embedding columns for", row.id, updateError);
          continue;
        }

        totalUpdated += 1;
      } catch (err) {
        console.error("Embedding failed for", row.id, err.message);
      }
    }
  }
}

function buildEmbeddingText(row) {
  const parts = [
    row.name || "",
    row.search_description || "",
    row.description || "",
    row.search_keywords || "",
  ];
  return parts
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(". ");
}

main();

