const { runChatCompletion } = require("./openaiClient");
const { runGeminiChatCompletion } = require("./geminiClient");

// --- Stage prompts ---------------------------------------------------------
// Stage 1: translation + entity hints (small and cacheable)
const TRANSLATOR_SYSTEM_PROMPT = `You translate Mizo/English mix to concise English for e-commerce in Aizawl.
Return JSON only:
{
  "normalized_text": "<short English rewrite>",
  "language": "<detected language>",
  "entities": {
    "product": "<explicit item/brand or ''>",
    "category": "<coarse category or ''>",
    "vendor": "<store/vendor if named or ''>",
    "quantity": "<like '1 kg' or ''>",
    "attributes": ["color","size","type"] // 0-5 short tokens
  }
}`;

// Stage 2: intent + slots + light responses (main classifier)
const CLASSIFIER_SYSTEM_PROMPT = `You are the storefront receptionist for Aizawl. Classify shopping intent and slots, using the provided normalized text and entity hints. Keep answers concise, JSON only, no markdown.
Intents: search, order, compare, discover_options, vendor_specific, availability, chitchat, dissatisfaction, other.
Rules:
- If clear purchase wording (order/buy) -> intent order.
- If greetings/thanks only -> chitchat.
- If asking what options/types/varieties -> discover_options.
- If asking stock/have/availability -> availability.
- If naming vendor/store -> vendor_specific.
- If complaining or not liking current options -> dissatisfaction.
- else default to search.
For order/search-like intents, produce keywords and a short query (2-10 words).
Responses:
- english_response: 1 short sentence toward closing the sale or next step.
- mizo_response: same in MizLish (Mizo + English mix).
- polite_response: only for chitchat/other/dissatisfaction; else "".

Output JSON only:
{
  "intent": "search|order|compare|discover_options|vendor_specific|availability|chitchat|dissatisfaction|other",
  "query": "<concise English search phrase or ''>",
  "product": "<item/brand or ''>",
  "vendor": "<store/vendor or ''>",
  "keywords": ["k1","k2"],
  "price_range": "",
  "category": "",
  "gender": "",
  "age_group": "",
  "personality_target": "",
  "quantity": "",
  "attributes": ["a1","a2"],
  "english_response": "<one short sentence>",
  "mizo_response": "<one short sentence in MizLish>",
  "polite_response": "<short sentence in MizLish or ''>"
}`;

async function parseUserMessage(text) {
  console.log("[parseUserMessage] text", text);
  try {
    const cleaned = (text || "").trim();
    if (!cleaned) return { intent: "search", query: "" };

    const { normalizedText, entityHints } = await translateAndExtract(cleaned);
    const parsed = await classifyIntent(normalizedText, cleaned, entityHints);
    const normalized = normalizeParsed(parsed, cleaned);

    console.log("[parseUserMessage] normalizedText", normalizedText);
    console.log("[parseUserMessage] parsed", parsed);
    console.log("[parseUserMessage] normalized", normalized);

    if (!normalized.intent) {
      return { intent: "search", query: cleaned };
    }

    if (
      normalized.intent === "other" ||
      normalized.intent === "chitchat" ||
      normalized.intent === "dissatisfaction"
    ) {
      return { ...normalized, query: "" };
    }

    return {
      ...normalized,
      query: normalized.query || normalizedText || cleaned,
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

const translatorCache = new Map();
const classifierCache = new Map();
const MAX_CACHE = 100;

function setCache(cache, key, value) {
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

async function translateAndExtract(text) {
  const cached = translatorCache.get(text);
  if (cached) return cached;

  const prompt = [
    { role: "system", content: TRANSLATOR_SYSTEM_PROMPT },
    { role: "user", content: text },
  ];

  let normalizedText = text;
  let entityHints = {};
  try {
    const raw = await runModel(prompt, { stage: "translate" });
    const parsed = parseJsonLoose(raw) || {};
    normalizedText = parsed.normalized_text || normalizedText;
    entityHints = parsed.entities || {};
  } catch (err) {
    console.warn("translateAndExtract failed, using raw text", err.message);
  }

  const result = { normalizedText, entityHints };
  setCache(translatorCache, text, result);
  return result;
}

async function classifyIntent(normalizedText, rawText, entityHints = {}) {
  const cacheKey = `${normalizedText}::${JSON.stringify(entityHints || {})}`;
  const cached = classifierCache.get(cacheKey);
  if (cached) return cached;

  const hintBlock = JSON.stringify(
    {
      normalized_text: normalizedText,
      original_text: rawText,
      entity_hints: entityHints,
    },
    null,
    2
  );

  const prompt = [
    { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Classify this shopping message:\n${hintBlock}`,
    },
  ];

  let parsed = null;
  try {
    const raw = await runModel(prompt, { stage: "classify" });
    parsed = parseJsonLoose(raw);
  } catch (err) {
    console.warn("classifyIntent failed", err.message);
  }

  if (!parsed || !parsed.intent) {
    parsed = ruleBasedClassify(rawText);
  }

  setCache(classifierCache, cacheKey, parsed);
  return parsed;
}

async function runModel(messages, { stage = "parser" } = {}) {
  const preferGemini = process.env.USE_GEMINI === "true";
  const allowFallback = process.env.ALLOW_OPENAI_FALLBACK === "true";
  const useGeminiCache = process.env.GEMINI_USE_CACHE === "true";

  if (preferGemini) {
    try {
      return await runGeminiChatCompletion(messages, {
        origin: `messageParser:${stage}`,
        useCache: useGeminiCache,
        cacheSeed: {
          systemInstruction: messages[0]?.content,
          examplesText: process.env.GEMINI_CACHE_EXAMPLES || "",
        },
      });
    } catch (err) {
      console.warn(`Gemini failed at stage ${stage}`, err.message);
      if (!allowFallback) throw err;
    }
  }

  try {
    return await runChatCompletion(messages);
  } catch (err) {
    console.warn(`OpenAI failed at stage ${stage}`, err.message);
    if (!preferGemini && allowFallback) {
      return await runGeminiChatCompletion(messages, {
        origin: `messageParser:fallback:${stage}`,
        useCache: useGeminiCache,
        cacheSeed: {
          systemInstruction: messages[0]?.content,
          examplesText: process.env.GEMINI_CACHE_EXAMPLES || "",
        },
      });
    }
    throw err;
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
    vendor: (safe.vendor || "").toString().trim(),
    quantity: (safe.quantity || "").toString().trim(),
    attributes: Array.isArray(safe.attributes)
      ? safe.attributes.map((a) => a && a.toString().trim()).filter(Boolean).slice(0, 10)
      : [],
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

