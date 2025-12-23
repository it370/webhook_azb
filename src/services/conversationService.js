const { parseUserMessage } = require("./messageParser");
const { embedText, runChatCompletion } = require("./openaiClient");
const { findProductsBySimilarity, fetchPopularProducts } = require("./ragService");
const { formatProductList } = require("../utils/formatters");
const { logPendingOrder } = require("./orderService");
const { expandQueryToCategories } = require("./queryExpander");
const { getContextPolicy } = require("./contextPolicy");
const { ensureConversation, loadRecentMessages, saveMessages } = require("./contextStore");

async function handleConversation(
  userText,
  { userId = "anonymous", policyOverrides = {}, sessionLanguage } = {}
) {
  const policy = getContextPolicy(policyOverrides);
  const conversationId = await ensureConversation(userId, policy.retentionDays);
  const history = await loadRecentMessages(conversationId, policy);
  const languagePref =
    sessionLanguage ||
    process.env.DEFAULT_SESSION_LANGUAGE ||
    "Mizo with English mix";

  const parsed = await parseUserMessage(userText);

  // Availability: answer based on actual catalog lookup, no generic fallback.
  if (parsed.intent === "availability") {
    const availabilityResult = await handleAvailabilityIntent(
      userText,
      parsed,
      policy,
      conversationId,
      history,
      languagePref
    );
    return availabilityResult;
  }

  if (parsed.intent === "order") {
    const order = await logPendingOrder({
      rawText: userText,
      requestedProduct: parsed.product || parsed.query || "unspecified item",
    });
    const reply = `Order noted for "${order.requestedProduct}". Mock payment confirmed ✅. We will reach out shortly to ${order.status}.`;
    await persist(conversationId, userText, reply);
    return { reply, products: [], parsed, conversationId, history, policy };
  }

  if (parsed.intent === "chitchat" || parsed.intent === "other" || !parsed.query) {
    const reply = await craftChitchatReply(userText, history, languagePref);
    await persist(conversationId, userText, reply);
    return { reply, products: [], parsed, expansion: null, conversationId, history, policy, language: languagePref };
  }

  const query = parsed.query || userText;
  const expansion = await expandQueryToCategories(query);
  const searchText = buildSearchText(query, expansion, parsed);

  let embedding = null;
  try {
    embedding = await embedText(searchText);
  } catch (err) {
    console.warn("Embedding unavailable, falling back to text search", err.message);
  }

  let products = await findProductsBySimilarity(embedding, {
    matchCount: 5,
    similarityThreshold: 0.1,
    queryText: searchText,
  });

  // console.log('[productsBySimilarity embedding result]', JSON.stringify(products, null, 2))

  if (!products.length) {
    console.log('[productsBySimilarity fallback searches]');
    const fallbackSearches = buildFallbackSearches(query, expansion, parsed);
    for (const fb of fallbackSearches) {
      products = await findProductsBySimilarity(null, {
        matchCount: 5,
        similarityThreshold: 0.4,
        queryText: fb,
      });
      if (products.length) break;
    }
  }

  let usedAlternatives = false;
  if (!products.length) {
    const alt = await findClosestAlternatives(query, expansion, parsed);
    if (alt.length) {
      products = alt;
      usedAlternatives = true;
    }
  }

  const relevantProducts = filterProducts(products, parsed);
  const formattedList = formatProductList(relevantProducts);
  const reply = await craftResponse(
    userText,
    formattedList,
    relevantProducts,
    expansion,
    history,
    languagePref,
    parsed,
    usedAlternatives
  );

  await persist(conversationId, userText, reply);

  return {
    reply,
    products,
    parsed,
    expansion,
    conversationId,
    history,
    policy,
    language: languagePref,
    mizo_response: parsed.mizo_response || "",
  };
}

async function craftChitchatReply(userText, history = [], languagePref = "Mizo with English mix") {
  const systemMessage = `You are a friendly shopping consultant for Aizawl. Default language: ${languagePref}. Stay strictly within shopping, catalog browsing, product advice, and purchase help. If the user goes out of scope (health, personal, unrelated), politely say it's out of scope in one short sentence. Keep replies max 1-2 sentences. If the user is just chatting or undecided, be encouraging and concise. If they ask to switch language, respect it for this session.`;
  const contextMessages = historyToChat(history);
  const prompt = [
    { role: "system", content: systemMessage },
    ...contextMessages,
    { role: "user", content: userText },
  ];
  const completion = await runChatCompletion(prompt);
  return completion || "Let me know whenever you're ready to shop.";
}

function buildSearchText(query, expansion, parsed = {}) {
  const parts = [
    query,
    parsed.product,
    ...(parsed.keywords || []),
    parsed.category,
    ...(expansion.keywords || []),
    ...(expansion.categories || []),
  ];
  return parts.filter(Boolean).join(" ");
}

function buildFallbackSearches(query, expansion = {}, parsed = {}) {
  const searches = [];
  const lower = (query || "").toLowerCase();
  const cats = (expansion.categories || []).map((c) => c.toLowerCase());
  const kws = [
    ...(expansion.keywords || []),
    ...(parsed.keywords || []),
    parsed.category || "",
    parsed.product || "",
  ]
    .map((k) => k.toLowerCase())
    .filter(Boolean);

  const festiveApparel = lower.includes("christmas") || lower.includes("church");
  const apparel = cats.includes("apparel") || cats.includes("clothing") || kws.includes("apparel");

  if (festiveApparel && apparel) {
    searches.push("christmas blazer coat dress formal shirt shoes scarves");
  }

  if (kws.length) {
    searches.push(kws.slice(0, 8).join(" "));
  }

  if (cats.length) {
    searches.push(cats.slice(0, 5).join(" "));
  }

  searches.push(query);
  return Array.from(new Set(searches)).filter(Boolean);
}

async function findClosestAlternatives(query, expansion = {}, parsed = {}) {
  const altQueries = [];
  const kws = (expansion.keywords || []).concat(parsed.keywords || []).filter(Boolean);
  const cats = (expansion.categories || []).filter(Boolean);

  if (kws.length) altQueries.push(kws.slice(0, 8).join(" "));
  if (cats.length) altQueries.push(cats.slice(0, 5).join(" "));
  if (parsed.category) altQueries.push(parsed.category);
  if (parsed.product) altQueries.push(parsed.product);

  const unique = Array.from(new Set(altQueries.filter(Boolean)));
  const results = [];

  for (const q of unique) {
    const hits = await findProductsBySimilarity(null, {
      matchCount: 5,
      similarityThreshold: 0.35,
      queryText: q,
    });
    if (hits?.length) {
      results.push(...hits);
      break;
    }
  }

  return results.slice(0, 5);
}

async function craftResponse(
  userText,
  formattedList,
  products = [],
  expansion = {},
  history = [],
  languagePref = "Mizo with English mix",
  parsed = {},
  usedAlternatives = false
) {
  if (!products.length) {
    const suggestionLine = buildSuggestionLine(userText, expansion, parsed);
    if (suggestionLine) {
      return suggestionLine;
    }
    return "I couldn’t find that item right now. Want me to try close alternatives?";
  }

  const prefix = usedAlternatives ? "Closest alternatives we have:\n" : "";
  const mizoLine = parsed.mizo_response ? `${parsed.mizo_response.trim()}\n` : "";
  return `${prefix}${mizoLine}${formattedList}`;
}

function buildSuggestionLine(userText, expansion = {}, parsed = {}) {
  const lower = (userText || "").toLowerCase();
  const cats = (expansion.categories || []).map((c) => c.toLowerCase());
  const kws = [
    ...(expansion.keywords || []),
    ...(parsed.keywords || []),
    parsed.category || "",
  ]
    .map((k) => k.toLowerCase())
    .filter(Boolean);

  const isApparel =
    cats.includes("apparel") ||
    cats.includes("clothing") ||
    kws.some((k) => k.includes("dress") || k.includes("coat") || k.includes("shirt"));
  const isFestive = lower.includes("christmas") || lower.includes("church");

  if (isApparel && isFestive) {
    const picks = ["blazers", "dresses", "coats", "formal shirts", "shoes", "scarves"];
    return `Festive outfit picks for Christmas/church: ${picks.join(", ")}. Sharing options now.`;
  }

  if (cats.length || kws.length) {
    const top = (kws.length ? kws : cats).slice(0, 6);
    return `Showing options for ${top.join(", ")}.`;
  }

  return "";
}

function filterProducts(products = [], parsed = {}) {
  const kws = (parsed.keywords || [])
    .concat(parsed.product || [])
    .concat(parsed.category || [])
    .map((k) => k && k.toString().toLowerCase().trim())
    .filter(Boolean);

  if (!kws.length) return products;

  const keep = products.filter((p) => {
    const haystack = [
      p.name,
      p.description,
      p.search_description,
      p.category_name,
      p.subcategory_name,
      Array.isArray(p.tag_names) ? p.tag_names.join(" ") : p.tag_names,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return kws.some((kw) => haystack.includes(kw));
  });

  return keep.length ? keep : products;
}

function historyToChat(history = []) {
  return history
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    }))
    .filter((m) => m.content);
}

async function handleAvailabilityIntent(
  userText,
  parsed,
  policy,
  conversationId,
  history,
  languagePref
) {
  const query = parsed.query || parsed.product || userText;
  const expansion = await expandQueryToCategories(query);
  const searchText = buildSearchText(query, expansion, parsed);

  let embedding = null;
  try {
    embedding = await embedText(searchText);
  } catch (err) {
    console.warn("Embedding unavailable for availability, using text search", err.message);
  }

  let products = await findProductsBySimilarity(embedding, {
    matchCount: 5,
    similarityThreshold: 0.4,
    queryText: searchText,
  });

  products = enforceRelevance(products, parsed, userText);

  if (!products.length) {
    const fallbackSearches = buildFallbackSearches(query, expansion, parsed);
    for (const fb of fallbackSearches) {
      products = await findProductsBySimilarity(null, {
        matchCount: 5,
        similarityThreshold: 0.5,
        queryText: fb,
      });
      products = enforceRelevance(products, parsed, userText);
      if (products.length) break;
    }
  }

  if (!products.length) {
    const reply = "I couldn’t find that item available right now. Want me to show close alternatives?";
    await persist(conversationId, userText, reply);
    return {
      reply,
      products: [],
      parsed,
      expansion,
      conversationId,
      history,
      policy,
      language: languagePref,
    };
  }

  const relevantProducts = products;
  const formattedList = formatProductList(relevantProducts);
  const availabilityLine =
    parsed.mizo_response ||
    parsed.english_response ||
    "Yes, available right now. Here are options:";
  const reply = `${availabilityLine}\n${formattedList}`;

  await persist(conversationId, userText, reply);

  return {
    reply,
    products: relevantProducts,
    parsed,
    expansion,
    conversationId,
    history,
    policy,
    language: languagePref,
    mizo_response: parsed.mizo_response || "",
  };
}

function enforceRelevance(products = [], parsed = {}, userText = "") {
  const haystackFields = (p) =>
    [
      p.name,
      p.description,
      p.search_description,
      p.category_name,
      p.subcategory_name,
      Array.isArray(p.tag_names) ? p.tag_names.join(" ") : p.tag_names,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const needleText = [
    parsed.query,
    parsed.product,
    parsed.category,
    ...(parsed.keywords || []),
    userText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const needles = Array.from(new Set(needleText.split(/[^a-z0-9]+/).filter((t) => t.length > 2)));
  if (!needles.length) return products;

  const filtered = products.filter((p) => {
    const hay = haystackFields(p);
    return needles.some((n) => hay.includes(n));
  });

  return filtered.length ? filtered : [];
}

async function persist(conversationId, userText, reply) {
  if (!conversationId) return;
  await saveMessages(conversationId, [
    { role: "user", text: userText },
    { role: "assistant", text: reply },
  ]);
}

module.exports = { handleConversation };

