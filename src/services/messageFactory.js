// Message payload builders for WhatsApp Business Cloud API.
// Each builder returns a payload ready to POST to
// https://graph.facebook.com/v20.0/{phone-number-id}/messages

function buildTextMessage(to, body) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  };
}

function buildTemplateMessage(to, templateName, languageCode, components = []) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };
}

function buildImageMessage(to, link, caption = "") {
  return {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link, caption },
  };
}

function buildDocumentMessage(to, link, filename = "", caption = "") {
  return {
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: { link, filename, caption },
  };
}

function buildAudioMessage(to, link) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "audio",
    audio: { link },
  };
}

function buildVideoMessage(to, link, caption = "") {
  return {
    messaging_product: "whatsapp",
    to,
    type: "video",
    video: { link, caption },
  };
}

function buildLocationMessage(to, latitude, longitude, name = "", address = "") {
  return {
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: { latitude, longitude, name, address },
  };
}

function buildInteractiveButtonsMessage(to, bodyText, buttons = []) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b, idx) => ({
          type: "reply",
          reply: { id: b.id || `btn_${idx}`, title: b.title },
        })),
      },
    },
  };
}

function buildInteractiveListMessage(to, bodyText, sections = [], headerText = "", footerText = "") {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: headerText ? { type: "text", text: headerText } : undefined,
      body: { text: bodyText },
      footer: footerText ? { text: footerText } : undefined,
      action: { sections },
    },
  };
}

module.exports = {
  buildTextMessage,
  buildTemplateMessage,
  buildImageMessage,
  buildDocumentMessage,
  buildAudioMessage,
  buildVideoMessage,
  buildLocationMessage,
  buildInteractiveButtonsMessage,
  buildInteractiveListMessage,
};

