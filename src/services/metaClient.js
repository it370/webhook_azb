const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

if (!phoneNumberId) {
  console.warn("META_PHONE_NUMBER_ID is not set; outbound WhatsApp replies will fail.");
}
if (!accessToken) {
  console.warn("META_SYSTEM_USER_ACCESS_TOKEN is not set; outbound WhatsApp replies will fail.");
}

async function sendWhatsAppText(to, body) {
  if (!phoneNumberId || !accessToken) {
    throw new Error("Meta credentials missing");
  }
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta send failed: ${res.status} ${text}`);
  }
}

module.exports = { sendWhatsAppText };

