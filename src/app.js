const express = require("express");
const webhookRouter = require("./routes/webhook");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use(webhookRouter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

module.exports = { createApp };

