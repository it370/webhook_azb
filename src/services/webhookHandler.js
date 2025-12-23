const { handleConversation } = require("./conversationService");

async function handleIncomingText(incomingText, options = {}) {
  if (!incomingText) {
    return {
      reply:
        "Hi! I can help you find products available in Aizawl. Tell me what you need.",
      products: [],
      parsed: { intent: "search", query: "" },
    };
  }

  return handleConversation(incomingText, options);
}

module.exports = { handleIncomingText };

