const { runChatCompletion } = require("./openaiClient");
const { runGeminiChatCompletion } = require("./geminiClient");
const { runHuggingFaceLocalCompletion } = require("./huggingfaceLocalClient");

const CLASSIFIER_SYSTEM_PROMPT = `You are a Mizo-to-English translator and e-commerce intent classifier for Aizawl.

Do these steps for every user input:
1) Translate the Mizo/English mix to English internally.
2) Decide intent: "search" (product/stock/availability/browsing), "order" (explicit request to place/confirm an order), "chitchat" (greetings/thanks/small-talk only), or "other" (non-shopping topics).
3) Derive a short English search query (2-10 words). If intent is not search/order, use "".
4) If an exact item/brand is named, set "product" to that text (English).
5) Generate 3-6 concise English product keywords for retrieval.
6) Capture optional cues when present: price_range, category, gender, age_group, personality_target. Use "" when absent.
7) Prepare a one-sentence English response and a concise MizLish (Mizo + English mix) response.
8) For chitchat/other only, include a polite_response in MizLish; otherwise keep it "".

Output JSON only, no markdown or code fences:
{
  "intent": "search|order|chitchat|other",
  "query": "<short english query or ''>",
  "product": "<explicit item/brand if given or ''>",
  "keywords": ["k1","k2"],
  "price_range": "",
  "category": "",
  "gender": "",
  "age_group": "",
  "personality_target": "",
  "english_response": "<one short sentence>",
  "mizo_response": "<one short sentence in MizLish>"
}`;

function buildPrompt(text) {
  return [
    { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
}

async function parseUserMessage(text) {
  console.log("[parseUserMessage] text", text);
  try {
    const prompt = buildPrompt(text);

    const useGemini = process.env.USE_GEMINI === "true";
    const useGeminiCache = process.env.GEMINI_USE_CACHE === "true";
    const useHf = process.env.USE_HF_LOCAL === "true";

    let raw;
    let parsed;
    try {
      raw = useHf
        ? await runHuggingFaceLocalCompletion(prompt)
        : useGemini
        ? await runGeminiChatCompletion(prompt, {
            origin: "messageParser",
            useCache: useGeminiCache,
            cacheSeed: {
              systemInstruction: prompt[0]?.content,
              examplesText: process.env.GEMINI_CACHE_EXAMPLES || "",
            },
          })
        : await runChatCompletion(prompt);
      console.log("[parseUserMessage] raw", raw);
      parsed = parseJsonLoose(raw);
    } catch (err) {
      console.warn("Primary classifier failed", err.message);
    }

    const allowOpenAiFallback = process.env.ALLOW_OPENAI_FALLBACK === "true";

    if ((!parsed || !parsed.intent) && useHf && !allowOpenAiFallback) {
      // HF failed to produce structured output; fall back to rule-based classifier.
      parsed = ruleBasedClassify(text);
    }

    // If still invalid and OpenAI fallback is allowed, try OpenAI once.
    if ((!parsed || !parsed.intent) && allowOpenAiFallback) {
      try {
        const fallbackRaw = await runChatCompletion(prompt);
        console.log("[parseUserMessage] fallback raw", fallbackRaw);
        parsed = parseJsonLoose(fallbackRaw);
      } catch (err) {
        console.warn("Fallback classifier failed", err.message);
      }
    }

    const normalized = normalizeParsed(parsed, text);

    if (!normalized.intent) {
      return { intent: "search", query: text };
    }

    if (normalized.intent === "other" || normalized.intent === "chitchat") {
      return {
        ...normalized,
        query: "",
      };
    }

    return {
      ...normalized,
      query: normalized.query || text,
    };
  } catch (error) {
    console.error("parseUserMessage failed", error);
    return { intent: "search", query: text };
  }
}

function parseJsonLoose(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // common failures: wrapped in fences or with leading text
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeParsed(parsed, fallbackQuery = "") {
  const safe = parsed && typeof parsed === "object" ? parsed : {};
  const intent = safe.intent || "";
  const baseQuery = (safe.query || "").toString().trim();
  const product = (safe.product || "").toString().trim();
  const keywords = Array.isArray(safe.keywords)
    ? safe.keywords.map((k) => k && k.toString().trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    intent,
    query: baseQuery || fallbackQuery,
    product,
    keywords,
    price_range: safe.price_range || "",
    category: safe.category || "",
    gender: safe.gender || "",
    age_group: safe.age_group || "",
    personality_target: safe.personality_target || "",
    english_response: safe.english_response || "",
    mizo_response: safe.mizo_response || "",
    polite_response: safe.polite_response || "",
  };
}

function ruleBasedClassify(text = "") {
  const t = text.toLowerCase();
  const hasOrder = /\b(order|buy now|place.*order|book)\b/.test(t);
  const hasAvailability =
    /\b(have|has|got|any|stock|availability|available|nei)\b/.test(t) ||
    /nei em/.test(t);
  const hasThanks = /\b(thank|khawngai|appreciate)\b/.test(t);
  const hasGreeting = /\b(hello|hi|hei|hey)\b/.test(t);

  if (hasOrder) return { intent: "order", query: text };
  if (hasAvailability) return { intent: "search", query: text };
  if (hasThanks || hasGreeting) return { intent: "chitchat", query: "" };
  return { intent: "search", query: text };
}

module.exports = { parseUserMessage };

