const express = require("express");
const { handleIncomingText } = require("../services/webhookHandler");
const { recordWebhookEvent } = require("../services/adminStore");

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
  console.log("Webhook payload:\n", JSON.stringify(req.body, null, 2));
  const { text: incomingText, from: sender } = extractWhatsAppFields(req.body);

  if (incomingText || sender) {
    console.log(`Inbound WhatsApp -> from: ${sender || "unknown"}, text: "${incomingText || ""}"`);
  }

  if (!incomingText) {
    const reply =
      "Hi! I can help you find products available in Aizawl. Tell me what you need.";
    recordWebhookEvent({
      source: "webhook",
      incomingText,
      from: sender,
      reply,
      products: [],
      parsed: { intent: "search", query: "" },
    });
    return res.status(200).json({ reply });
  }

  try {
    console.log("----processing incoming text---");
    const result = await handleIncomingText(incomingText);
    recordWebhookEvent({
      source: "webhook",
      incomingText,
      from: sender,
      reply: result.reply,
      products: result.products,
      parsed: result.parsed,
    });
    return res.status(200).json({ reply: result.reply, products: result.products });
  } catch (error) {
    console.error("Webhook processing failed", error);
    recordWebhookEvent({
      source: "webhook",
      incomingText,
      from: sender,
      error: error.message,
      reply:
        "Sorry, I ran into a snag. Please try again with the product you want in Aizawl.",
      products: [],
    });
    return res.status(200).json({
      reply:
        "Sorry, I ran into a snag. Please try again with the product you want in Aizawl.",
    });
  }
});

function extractWhatsAppFields(body) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const text =
    msg?.text?.body || body?.message?.text || body?.text || "";
  const from = msg?.from || body?.from || "";
  return {
    text: typeof text === "string" ? text.trim() : "",
    from: typeof from === "string" ? from.trim() : "",
  };
}

module.exports = router;

