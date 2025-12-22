const MAX_EVENTS = 50;

const webhookEvents = [];

function recordWebhookEvent(event) {
  if (!event) return;
  webhookEvents.unshift({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...event,
  });

  if (webhookEvents.length > MAX_EVENTS) {
    webhookEvents.length = MAX_EVENTS;
  }
}

function getWebhookEvents() {
  return [...webhookEvents];
}

module.exports = { recordWebhookEvent, getWebhookEvents };

