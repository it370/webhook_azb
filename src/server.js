const dotenv = require("dotenv");
dotenv.config();

const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  // Basic startup log for visibility
  console.log(`Aizawl Bazaar WhatsApp AI listening on :${PORT}`);
});

