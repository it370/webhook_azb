const { parseUserMessage } = require("./messageParser");
const { runChatCompletion } = require("./openaiClient");

async function classifyAndRespond(text, { sessionLanguage } = {}) {
  const languagePref =
    sessionLanguage || process.env.DEFAULT_SESSION_LANGUAGE || "Mizo with English mix";

  const parsed = await parseUserMessage(text);

  if (parsed.intent === "chitchat" || parsed.intent === "other" || !parsed.query) {
    const reply = await craftChitchatReply(text, languagePref);
    return { intent: parsed.intent, reply, query: "", parsed, language: languagePref };
  }

  return {
    intent: parsed.intent,
    query: parsed.query || text,
    parsed,
    language: languagePref,
  };
}

async function craftChitchatReply(userText, languagePref) {
  const systemMessage = `You are a friendly shopping consultant for Aizawl. Default language: ${languagePref}. Stay strictly within shopping, catalog browsing, product advice, and purchase help. If the user goes out of scope (health, personal, unrelated), politely say it's out of scope in one short sentence. Keep replies max 1-2 sentences. If the user is just chatting or undecided, be encouraging and concise. If they ask to switch language, respect it for this session.`;
  const prompt = [
    { role: "system", content: systemMessage },
    { role: "user", content: userText },
  ];
  const completion = await runChatCompletion(prompt);
  return completion || "Let me know whenever you're ready to shop.";
}

module.exports = { classifyAndRespond };

