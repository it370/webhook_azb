function formatProductList(products = []) {
  if (!products.length) return "";

  return products
    .map((p) => {
      const vendorName = p.vendor_name || p.vendor?.name || "Unknown shop";
      const location = p.veng_location || p.vendor?.veng_location || "";
      const price = p.price ? `₹${p.price}` : "Price on request";
      const stock = p.stock_status === false ? " (out of stock)" : "";
      const place = location ? ` - ${location}` : "";
      return `- **${p.name}** (${price}) @ ${vendorName}${place}${stock}`;
    })
    .join("\n");
}

module.exports = { formatProductList };

