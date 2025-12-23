const path = require("path");
const express = require("express");
const webhookRouter = require("./routes/webhook");
const adminRouter = require("./routes/admin");
const agentRouter = require("./routes/agent");
const translateRouter = require("./routes/translate");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use(webhookRouter);
  app.use("/admin", adminRouter);
  app.use(agentRouter);
  app.use(translateRouter);
  app.use(
    "/admin",
    express.static(path.join(__dirname, "../public/admin"), {
      fallthrough: true,
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

module.exports = { createApp };

