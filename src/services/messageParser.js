const { runChatCompletion } = require("./openaiClient");

async function parseUserMessage(text) {
  try {
    const prompt = [
      {
        role: "system",
        content:
          "You read WhatsApp messages in Mizo + English. Output compact JSON only: {\"intent\":\"search|order|other\",\"query\":\"text\",\"product\":\"optional\"}. Only shopping for Aizawl is allowed.",
      },
      { role: "user", content: text },
    ];

    const raw = await runChatCompletion(prompt);
    const parsed = tryParseJSON(raw);

    if (!parsed || !parsed.intent) {
      return { intent: "search", query: text };
    }

    if (parsed.intent === "other") {
      return { intent: "other", query: "" };
    }

    return {
      intent: parsed.intent,
      query: parsed.query || text,
      product: parsed.product,
    };
  } catch (error) {
    console.error("parseUserMessage failed", error);
    return { intent: "search", query: text };
  }
}

function tryParseJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { parseUserMessage };

