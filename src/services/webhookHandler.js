const { parseUserMessage } = require("./messageParser");
const { embedText, runChatCompletion } = require("./openaiClient");
const { findProductsBySimilarity } = require("./ragService");
const { formatProductList } = require("../utils/formatters");
const { logPendingOrder } = require("./orderService");

async function handleIncomingText(incomingText) {
  if (!incomingText) {
    return {
      reply:
        "Hi! I can help you find products available in Aizawl. Tell me what you need.",
      products: [],
      parsed: { intent: "search", query: "" },
    };
  }

  const parsed = await parseUserMessage(incomingText);

  if (parsed.intent === "order") {
    const order = await logPendingOrder({
      rawText: incomingText,
      requestedProduct: parsed.product || parsed.query || "unspecified item",
    });

    return {
      reply: `Order noted for "${order.requestedProduct}". Mock payment confirmed ✅. We will reach out shortly to ${order.status}.`,
      products: [],
      parsed,
    };
  }

  const query = parsed.query || incomingText;

  let embedding = null;
  try {
    embedding = await embedText(query);
  } catch (err) {
    console.warn("Embedding unavailable, falling back to text search", err.message);
  }

  const products = await findProductsBySimilarity(embedding, {
    matchCount: 5,
    similarityThreshold: 0.5,
    queryText: query,
  });

  console.log('similar products', products);
  console.log('query', query);

  const formattedList = formatProductList(products);
  const reply = await craftResponse(incomingText, formattedList, products);

  return { reply, products, parsed };
}

async function craftResponse(userText, formattedList, products = []) {
  if (!products.length) {
    return "I couldn't find a close match yet. Try a specific item or brand (e.g., \"Lays chips\"), or ask for a different product.";
  }

  if (!formattedList) {
    return "I can help with shopping info in Aizawl. What are you looking for?";
  }

  const systemMessage =
    "You are a concise shopping assistant for Aizawl. Only answer shopping or Aizawl logistics questions. Use bullets with bold product names. Keep replies WhatsApp-friendly.";

  const prompt = [
    { role: "system", content: systemMessage },
    {
      role: "user",
      content: `Customer said: "${userText}". Recommend from these products:\n${formattedList}`,
    },
  ];

  const completion = await runChatCompletion(prompt);
  return completion || formattedList;
}

module.exports = { handleIncomingText };

