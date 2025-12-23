const express = require("express");
const { classifyAndRespond } = require("../services/classifierService");

const router = express.Router();

router.post("/agent/classify", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const sessionLanguage = req.body?.language;

  if (!text) {
    return res.status(400).json({ error: "Provide text to classify." });
  }

  try {
    const result = await classifyAndRespond(text, { sessionLanguage });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Agent classify failed", err);
    return res.status(500).json({ error: "Classification failed" });
  }
});

module.exports = router;

