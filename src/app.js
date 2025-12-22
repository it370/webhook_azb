const path = require("path");
const express = require("express");
const webhookRouter = require("./routes/webhook");
const adminRouter = require("./routes/admin");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use(webhookRouter);
  app.use("/admin", adminRouter);
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

