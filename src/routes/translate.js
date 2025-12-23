const express = require("express");
const { runHuggingFaceLocalCompletion } = require("../services/huggingfaceLocalClient");

const router = express.Router();

router.post("/translate", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const maxNewTokens = Number.parseInt(req.body?.maxNewTokens, 10) || 64;

  if (!text) {
    return res.status(400).json({ error: "Provide text to translate." });
  }

  try {
    const prompt = [
      {
        role: "user",
        content: text,
      },
    ];
    const raw = await runHuggingFaceLocalCompletion(prompt, {
      max_new_tokens: maxNewTokens,
    });
    return res.status(200).json({ translated: raw });
  } catch (err) {
    console.error("Translation failed", err);
    return res.status(500).json({ error: "Translation failed" });
  }
});

module.exports = router;

