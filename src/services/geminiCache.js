const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const cacheModel =
  process.env.GEMINI_CACHE_MODEL ||
  geminiModel ||
  "gemini-2.5-flash-lite";

let cachedContentName = process.env.GEMINI_CACHE_ID || null;

function secondsToDuration(ttlSeconds = 86400) {
  const safe = Number.isFinite(ttlSeconds) ? Math.max(60, Math.min(ttlSeconds, 7 * 24 * 3600)) : 86400;
  return `${safe}s`;
}

function getCachedContentName() {
  return cachedContentName;
}

async function ensureGeminiCache({
  systemInstruction,
  examplesText = "",
  displayName = process.env.GEMINI_CACHE_DISPLAY_NAME || "mizo_ecommerce_cache",
  ttlSeconds = Number.parseInt(process.env.GEMINI_CACHE_TTL_SECONDS || "", 10) || 86400,
} = {}) {
  if (cachedContentName) return cachedContentName;
  if (!process.env.GEMINI_USE_CACHE || process.env.GEMINI_USE_CACHE !== "true") return null;
  if (!geminiApiKey) return null;
  if (!systemInstruction) {
    console.warn("Gemini cache skipped: system instruction missing.");
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${geminiApiKey}`;
  const body = {
    // API expects the raw model id (e.g., "gemini-2.5-flash-lite"); do not prefix.
    model: cacheModel,
    displayName,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        parts: [
          {
            text:
              examplesText ||
              "Example: Mizo input and ideal JSON response. Add more examples via GEMINI_CACHE_EXAMPLES env.",
          },
        ],
      },
    ],
    ttl: secondsToDuration(ttlSeconds),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(
        "Failed to create Gemini cache",
        res.status,
        text,
        "model=",
        cacheModel
      );
      return null;
    }

    const data = await res.json();
    cachedContentName = data?.name || null;
    if (cachedContentName) {
      console.log("Gemini cache created", cachedContentName);
    }
    return cachedContentName;
  } catch (err) {
    console.warn("Error creating Gemini cache", err.message);
    return null;
  }
}

module.exports = { ensureGeminiCache, getCachedContentName };

