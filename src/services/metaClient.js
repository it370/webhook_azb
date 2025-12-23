const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
const {
  buildTextMessage,
  buildImageMessage,
  buildInteractiveCarouselMessage,
  buildContextualTextMessage,
  buildLocationRequestMessage,
} = require("./messageFactory");

if (!phoneNumberId) {
  console.warn("META_PHONE_NUMBER_ID is not set; outbound WhatsApp replies will fail.");
}
if (!accessToken) {
  console.warn("META_SYSTEM_USER_ACCESS_TOKEN is not set; outbound WhatsApp replies will fail.");
}

async function sendWhatsAppText(to, body) {
  const payload = buildTextMessage(to, body);
  return sendWhatsAppMessage(payload);
}

async function sendWhatsAppCarousel(
  to,
  products = [],
  bodyText = "Check out our latest offers!"
) {
  const cards = buildCarouselCards(products);
  if (!cards.length) {
    return sendWhatsAppText(to, bodyText);
  }

  // WhatsApp requires 2-10 cards for carousel. If we only have one valid card,
  // fall back to a single image message to avoid silent drops.
  if (cards.length === 1) {
    const single = cards[0];
    const imgLink = single?.header?.image?.link;
    const caption = single?.body?.text || bodyText;
    if (imgLink) {
      const image_urls = [
        'https://brand.assets.adidas.com/image/upload/f_auto,q_auto:best,fl_lossy/iwp_back_shoes_new_Copy_2_1860a6d08c.jpg',
        'https://brand.assets.adidas.com/image/upload/f_auto,q_auto:best,fl_lossy/men_running_shoes_iwp_Copy_2_cd360fc6a3.jpg',
        'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/c65b695b3ca742648dfc40644f03b1c9_9366/chavarria-jabbar-low-shoes.jpg',
        'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/bad9647ac68648c193681dac9a9f3475_9366/sl-72-rs-shoes.jpg',
        'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/87c242ae5aa4464d9e6ef819c7326771_9366/Ultraboost_1.0_Shoes_White_JQ0823_02_standard_hover.jpg'
      ]

      const imagePayload = buildImageMessage(to, image_urls[Math.floor(Math.random() * image_urls.length)], caption);
      return sendWhatsAppMessage(imagePayload);
    }
    return sendWhatsAppText(to, bodyText);
  }

  const payload = buildInteractiveCarouselMessage(to, cards, bodyText);
  return sendWhatsAppMessage(payload);
}

function sendWhatsAppLocationRequest(
  to,
  bodyText
) {
  const payload = buildLocationRequestMessage(to, bodyText);
  return sendWhatsAppMessage(payload);
}

function sendWhatsAppContextualText(to, body, replyToMessageId) {
  const payload = buildContextualTextMessage(to, body, replyToMessageId);
  return sendWhatsAppMessage(payload);
}

async function sendWhatsAppMessage(payload) {
  console.log(
    "[whatsAppSendRequest] sending message to WhatsApp",
    // JSON.stringify(payload, null, 2)
  );
  if (!phoneNumberId || !accessToken) {
    throw new Error("Meta credentials missing");
  }
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  const responseJson = safeJsonParse(responseText);

  if (!res.ok) {
    throw new Error(
      `Meta send failed: ${res.status} ${responseText || "no body"}`
    );
  }

  console.log(
    "[whatsAppSendRequest] message sent to WhatsApp successfully",
    responseJson || responseText
  );
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildCarouselCards(products = []) {  
  return (products || [])
    .map((p, index) => buildCarouselCard(p, index))
    .filter(Boolean)
    .slice(0, 10); // WhatsApp allows up to 10 cards
}

function buildCarouselCard(product, index) {
  const image_urls = [
    'https://brand.assets.adidas.com/image/upload/f_auto,q_auto:best,fl_lossy/iwp_back_shoes_new_Copy_2_1860a6d08c.jpg',
    'https://brand.assets.adidas.com/image/upload/f_auto,q_auto:best,fl_lossy/men_running_shoes_iwp_Copy_2_cd360fc6a3.jpg',
    'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/c65b695b3ca742648dfc40644f03b1c9_9366/chavarria-jabbar-low-shoes.jpg',
    'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/bad9647ac68648c193681dac9a9f3475_9366/sl-72-rs-shoes.jpg',
    'https://assets.adidas.com/images/w_766,h_766,f_auto,q_auto,fl_lossy,c_fill,g_auto/87c242ae5aa4464d9e6ef819c7326771_9366/Ultraboost_1.0_Shoes_White_JQ0823_02_standard_hover.jpg'
  ]
  const imageLink = image_urls[Math.floor(Math.random() * image_urls.length)];
  // const imageLink =
  //   product?.hero_image_url ||
  //   product?.thumbnail_url ||
  //   product?.cover_image_url ||
  //   product?.minified_image_url;

  if (!imageLink) {
    return null;
  }

  const price = product?.price ? `₹${product.price}` : "Price on request";
  const vendor = product?.vendor_name || product?.vendor?.name || "Shop";
  const body = truncate(
    `${product?.name || "Product"} • ${price} • ${vendor}`,
    80
  );
  const url =
    product?.product_url ||
    product?.url ||
    product?.buy_url ||
    product?.checkout_url ||
    product?.shop_url ||
    product?.landing_url ||
    product?.deep_link ||
    product?.link ||
    "https://aizawlbazaar.com";

  return {
    card_index: index,
    type: "cta_url",
    header: {
      type: "image",
      image: { link: imageLink },
    },
    body: { text: body },
    action: {
      name: "cta_url",
      parameters: {
        display_text: "Shop now",
        url,
      },
    },
  };
}

function truncate(text, max = 80) {
  if (!text || typeof text !== "string") return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

module.exports = {
  sendWhatsAppText,
  sendWhatsAppCarousel,
  sendWhatsAppLocationRequest,
  sendWhatsAppContextualText,
  sendWhatsAppMessage,
};

