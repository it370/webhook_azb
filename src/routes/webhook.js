const express = require("express");
const { parseUserMessage } = require("../services/messageParser");
const { embedText, runChatCompletion } = require("../services/openaiClient");
const { findProductsBySimilarity } = require("../services/ragService");
const { formatProductList } = require("../utils/formatters");
const { logPendingOrder } = require("../services/orderService");

const router = express.Router();

router.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    return res.status(500).send("Verification token not configured");
  }

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Verification failed");
});

router.post("/webhook", async (req, res) => {
  const incomingText = extractWhatsAppText(req.body);

  if (!incomingText) {
    return res.status(200).json({
      reply:
        "Hi! I can help you find products available in Aizawl. Tell me what you need.",
    });
  }

  try {
    const parsed = await parseUserMessage(incomingText);

    if (parsed.intent === "order") {
      const order = await logPendingOrder({
        rawText: incomingText,
        requestedProduct: parsed.product || parsed.query || "unspecified item",
      });

      return res.status(200).json({
        reply: `Order noted for "${order.requestedProduct}". Mock payment confirmed ✅. We will reach out shortly to ${order.status}.`,
      });
    }

    const query = parsed.query || incomingText;
    const embedding = await embedText(query);
    const products = await findProductsBySimilarity(embedding, {
      matchCount: 5,
      similarityThreshold: 0.5,
    });

    const formattedList = formatProductList(products);
    const reply = await craftResponse(incomingText, formattedList, products);

    return res.status(200).json({ reply, products });
  } catch (error) {
    console.error("Webhook processing failed", error);
    return res.status(200).json({
      reply:
        "Sorry, I ran into a snag. Please try again with the product you want in Aizawl.",
    });
  }
});

function extractWhatsAppText(body) {
  // Meta Cloud API structure: entry[0].changes[0].value.messages[0].text.body
  const message =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body ||
    body?.message?.text ||
    body?.text ||
    "";
  return typeof message === "string" ? message.trim() : "";
}

async function craftResponse(userText, formattedList, products = []) {
  if (!formattedList) {
    return "I can help with shopping info in Aizawl. What are you looking for?";
  }

  if (!products.length) {
    return "I couldn't find a close match right now. Tell me more about the item or a different brand.";
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

module.exports = router;

