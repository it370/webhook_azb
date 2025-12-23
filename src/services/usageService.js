const { getSupabaseClient } = require("./supabaseClient");

const TABLE = "gemini_usage_logs";

function getClientOrNull() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase not configured. Skipping Gemini usage logging.");
    return null;
  }
  return supabase;
}

async function recordGeminiUsage({
  model,
  responseId,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens,
  origin = "unknown",
  rawUsage = null,
} = {}) {
  const supabase = getClientOrNull();
  if (!supabase) return { error: "Supabase not configured" };

  const totals =
    typeof totalTokens === "number"
      ? totalTokens
      : (promptTokens || 0) + (completionTokens || 0);

  const payload = {
    model,
    response_id: responseId,
    prompt_tokens: promptTokens ?? null,
    completion_tokens: completionTokens ?? null,
    total_tokens: totals,
    origin,
    raw_usage: rawUsage,
  };

  const { error } = await supabase.from(TABLE).insert(payload);
  if (error) {
    console.warn("Failed to record Gemini usage", error.message);
    return { error: error.message };
  }

  return { ok: true };
}

async function fetchGeminiUsage({ days = 30, limit = 100 } = {}) {
  const supabase = getClientOrNull();
  if (!supabase) return { rows: [], error: "Supabase not configured" };

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id,created_at,model,response_id,prompt_tokens,completion_tokens,total_tokens,origin"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: data || [], error: null };
}

function summarizeUsage(rows = []) {
  return rows.reduce(
    (acc, row) => ({
      promptTokens: acc.promptTokens + (row.prompt_tokens || 0),
      completionTokens: acc.completionTokens + (row.completion_tokens || 0),
      totalTokens: acc.totalTokens + (row.total_tokens || 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

async function getGeminiUsageSummary({ days = 30, limit = 100 } = {}) {
  const { rows, error } = await fetchGeminiUsage({ days, limit });
  const totals = summarizeUsage(rows);
  return { rows, totals, error };
}

module.exports = {
  recordGeminiUsage,
  fetchGeminiUsage,
  getGeminiUsageSummary,
};

