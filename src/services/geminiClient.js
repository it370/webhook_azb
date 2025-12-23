const { recordGeminiUsage } = require("./usageService");
const { ensureGeminiCache, getCachedContentName } = require("./geminiCache");

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";

if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY is not set; Gemini client will not work.");
}

async function runGeminiChatCompletion(
  messages,
  { origin = "unknown", useCache = false, cacheSeed } = {}
) {
  if (!geminiApiKey) throw new Error("Gemini client not configured");

  // Flatten messages to a single prompt; Gemini supports role separation via parts.
  const parts = messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role, // treat system as user instruction
    parts: [{ text: m.content }],
  }));

  // Optionally hydrate a cached prompt to save tokens on repeated calls.
  let cachedContent = null;
  if (useCache) {
    cachedContent =
      getCachedContentName() ||
      (await ensureGeminiCache({
        systemInstruction: cacheSeed?.systemInstruction,
        examplesText: cacheSeed?.examplesText,
      }));
  }

  const body = {
    contents: parts,
    cachedContent,
    generationConfig: {
      temperature: 0.0,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  // console.log("[runGeminiChatCompletion] data", data);

  if (data?.usageMetadata) {
    try {
      await recordGeminiUsage({
        model: data.modelVersion || geminiModel,
        responseId: data.responseId,
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
        origin,
        rawUsage: data.usageMetadata,
      });
    } catch (err) {
      console.warn("Failed to persist Gemini usage", err.message);
    }
  }

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    data.candidates?.[0]?.output ||
    "";
  return text.trim();
}

module.exports = { runGeminiChatCompletion };

