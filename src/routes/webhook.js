const express = require("express");
const { handleIncomingText } = require("../services/webhookHandler");
const { recordWebhookEvent } = require("../services/adminStore");
const { sendWhatsAppText, sendWhatsAppCarousel, sendWhatsAppLocationRequest, sendWhatsAppContextualText } = require("../services/metaClient");

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
  // console.log("Webhook payload:\n", JSON.stringify(req.body, null, 2));
  const { text: incomingText, from: sender, location, type, messageId } = extractWhatsAppFields(req.body);
  console.log('---incoming text', incomingText);
  
  if (type === "location") {
    console.log('---incoming location', location);
    console.log(['webhook_entry'], 'Location received from user, we will save this in database later if requested');
    if (sender) {
      await sendWhatsAppContextualText(
        sender,
        "Kan lawm e (Thank you!)",
        messageId
      );
    }
    return res.status(200).json({ reply: 'Location received from user, we will save this in database later if requested' });
  }

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
    const result = await handleIncomingText(incomingText, {
      userId: sender || "anonymous",
      sessionLanguage: process.env.DEFAULT_SESSION_LANGUAGE || "Mizo with English mix",
    });
    recordWebhookEvent({
      source: "webhook",
      incomingText,
      from: sender,
      reply: result.reply,
      products: result.products,
      parsed: result.parsed,
      mizo_response: result.mizo_response,
    });
    if (sender) {
      try {
        // console.log('--- preparing whatsapp response, the raw result was:', JSON.stringify(result, null, 2));
        if (result.products?.length > 0) {
          await sendWhatsAppCarousel(
            sender,
            result.products,
            result.reply || "Check out our latest offers!"
          );
        } else {
          await sendWhatsAppText(sender, result.reply);
        }
        
        if (result.parsed?.intent === "order") {
          await sendWhatsAppLocationRequest(sender, "Deliver na tur address map ah hian min lo share sak thei em khawngaihin?");
        }
      } catch (sendErr) {
        console.error("Failed to send WhatsApp reply", sendErr);
      }
    }
    return res.status(200).json({
      reply: result.reply,
      mizo_response: result.mizo_response,
      products: result.products,
    });
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
  const type = msg?.type || body?.type || "";
  const messageId = msg?.id || body?.message?.id || "";
  return {
    text: typeof text === "string" ? text.trim() : "",
    from: typeof from === "string" ? from.trim() : "",
    type: typeof type === "string" ? type.trim() : "",
    messageId: typeof messageId === "string" ? messageId.trim() : "",
    location: type === "location" ? msg?.location || {} : {},
  };
}

module.exports = router;

