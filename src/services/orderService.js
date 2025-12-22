// Simple in-memory log for demo. Replace with Supabase insert in production.
const pendingOrders = [];

async function logPendingOrder({ rawText, requestedProduct }) {
  const order = {
    id: `order_${Date.now()}`,
    requestedProduct,
    rawText,
    status: "pending_payment",
    createdAt: new Date().toISOString(),
  };

  pendingOrders.push(order);
  console.log("Pending order recorded", order);
  return order;
}

module.exports = { logPendingOrder, pendingOrders };

