const path = require("path");
const express = require("express");
const { handleIncomingText } = require("../services/webhookHandler");
const { getWebhookEvents, recordWebhookEvent } = require("../services/adminStore");
const { pendingOrders } = require("../services/orderService");
const { listProducts } = require("../services/productService");
const { sendWhatsAppText } = require("../services/metaClient");

const router = express.Router();

router.get("/api/events", (_req, res) => {
  res.json({ events: getWebhookEvents() });
});

router.get("/api/orders", (_req, res) => {
  res.json({ orders: pendingOrders });
});

router.post("/api/test", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "Provide text to test." });
  }

  try {
    const result = await handleIncomingText(text);
    recordWebhookEvent({
      source: "admin-test",
      incomingText: text,
      reply: result.reply,
      products: result.products,
      parsed: result.parsed,
    });
    return res.status(200).json({
      reply: result.reply,
      products: result.products,
      parsed: result.parsed,
    });
  } catch (error) {
    recordWebhookEvent({
      source: "admin-test",
      incomingText: text,
      error: error.message,
    });
    return res
      .status(500)
      .json({ error: "Test run failed. Check server logs for details." });
  }
});

router.get("/api/products", async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 100;
    const { products, error } = await listProducts({ limit });

    if (error) {
      return res.status(500).json({ error });
    }

    return res.json({ products });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load products" });
  }
});

router.post("/api/reply", async (req, res) => {
  const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
  const body = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!to || !body) {
    return res.status(400).json({ error: "Both 'to' (phone) and 'text' are required." });
  }

  try {
    await sendWhatsAppText(to, body);
    recordWebhookEvent({
      source: "admin-reply",
      outgoingTo: to,
      reply: body,
    });
    return res.status(200).json({ status: "sent" });
  } catch (err) {
    console.error("Failed to send WhatsApp reply", err);
    return res.status(500).json({ error: err.message || "Send failed" });
  }
});

// Serve the admin UI
router.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/admin/index.html"));
});

module.exports = router;

