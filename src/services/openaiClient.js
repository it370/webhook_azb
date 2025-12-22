const OpenAI = require("openai");

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set. AI features will not work.");
}

const client = apiKey ? new OpenAI({ apiKey }) : null;

async function embedText(text) {
  if (!client) throw new Error("OpenAI client not configured");
  const cleaned = text.trim().slice(0, 2000); // avoid excessive tokens
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: cleaned,
  });
  return response.data[0].embedding;
}

async function runChatCompletion(messages) {
  if (!client) throw new Error("OpenAI client not configured");
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3,
  });
  return completion.choices[0]?.message?.content?.trim();
}

module.exports = { embedText, runChatCompletion };

