const { runChatCompletion } = require("./openaiClient");

async function expandQueryToCategories(text) {
  const prompt = [
    {
      role: "system",
      content:
        "You help classify shopping intents. Return compact JSON only: {\"categories\":[\"...\"],\"keywords\":[\"...\"],\"specificity\":\"generic|specific\"}. Categories should be broad retail groups (e.g., bakery, toys, bikes, electronics). Keywords should be concrete product terms. Mark as generic when the user is broad or vague.",
    },
    { role: "user", content: text },
  ];

  try {
    const raw = await runChatCompletion(prompt);
    const parsed = safeParseJSON(raw);
    if (!parsed) return defaultResult();
    return {
      categories: arrayOrEmpty(parsed.categories),
      keywords: arrayOrEmpty(parsed.keywords),
      specificity: parsed.specificity === "specific" ? "specific" : "generic",
    };
  } catch (err) {
    console.warn("expandQueryToCategories failed", err.message);
    return defaultResult();
  }
}

function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function arrayOrEmpty(val) {
  return Array.isArray(val) ? val.filter(Boolean).map(String) : [];
}

function defaultResult() {
  return { categories: [], keywords: [], specificity: "generic" };
}

module.exports = { expandQueryToCategories };

