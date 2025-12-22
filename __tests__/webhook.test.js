const request = require("supertest");

jest.mock("../src/services/messageParser", () => ({
  parseUserMessage: jest.fn(),
}));

jest.mock("../src/services/openaiClient", () => ({
  embedText: jest.fn(),
  runChatCompletion: jest.fn(),
}));

jest.mock("../src/services/ragService", () => ({
  findProductsBySimilarity: jest.fn(),
}));

jest.mock("../src/services/orderService", () => ({
  logPendingOrder: jest.fn(),
}));

const { parseUserMessage } = require("../src/services/messageParser");
const { embedText, runChatCompletion } = require("../src/services/openaiClient");
const { findProductsBySimilarity } = require("../src/services/ragService");
const { logPendingOrder } = require("../src/services/orderService");
const { createApp } = require("../src/app");

describe("POST /webhook", () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns formatted products and AI reply for search intent", async () => {
    parseUserMessage.mockResolvedValue({ intent: "search", query: "cake" });
    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    findProductsBySimilarity.mockResolvedValue([
      {
        id: "prod_1",
        name: "Plum Cake",
        price: 180,
        vendor_name: "City Bakery",
        veng_location: "Chanmari",
        stock_status: true,
      },
    ]);
    runChatCompletion.mockResolvedValue("Here are some cakes you might like.");

    const res = await request(app).post("/webhook").send({ text: "cake" });

    expect(res.status).toBe(200);
    expect(embedText).toHaveBeenCalledWith("cake");
    expect(findProductsBySimilarity).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ matchCount: 5, similarityThreshold: 0.5 })
    );
    expect(res.body.products).toHaveLength(1);
    expect(res.body.reply).toContain("cakes");
  });

  test("handles order intent without calling product search", async () => {
    parseUserMessage.mockResolvedValue({
      intent: "order",
      product: "apple juice",
      query: "apple juice",
    });
    logPendingOrder.mockResolvedValue({
      requestedProduct: "apple juice",
      status: "pending_payment",
    });

    const res = await request(app)
      .post("/webhook")
      .send({ text: "I want apple juice" });

    expect(res.status).toBe(200);
    expect(embedText).not.toHaveBeenCalled();
    expect(findProductsBySimilarity).not.toHaveBeenCalled();
    expect(res.body.reply).toContain("apple juice");
  });
});

