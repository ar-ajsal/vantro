const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: { type: String, required: false },
  sku: { type: String, required: false },
  barcode: { type: String, required: false },
  title: { type: Object, required: true }, // e.g. { en: "Product Title" }
  description: { type: Object, required: false },
  slug: { type: String, required: false },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  image: [{ type: String }],
  stock: { type: Number, default: 0 },
  tag: [{ type: String }],
  prices: {
    price: { type: Number, default: 0 },
    originalPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 }
  },
  isCombination: { type: Boolean, default: false },
  // Defined option axes (e.g. [{ name: 'Size', values: ['S', 'M', 'L'] }])
  options: [{
    name: { type: String, required: true },
    values: [{ type: String, required: true }]
  }],
  // Combinations or legacy option groups
  variants: [{ type: Object }],
  // Quantity-tier pricing (Buy More Save More).
  // Each entry: { minQty: Number, price: Number }.
  // Sorted descending by minQty at query time. Products without this field
  // fall through to the flat prices.price value — fully backward compatible.
  qtyPricing: [{
    minQty: { type: Number, required: true, min: 1 },
    price:  { type: Number, required: true, min: 0 }
  }],
  status: { type: String, default: 'show' },
  isFeatured: { type: Boolean, default: false },
  isBestSeller: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { timestamps: true });

// ─── Indexes for common queries ────────────────────────────
// Storefront resolves a product by slug on every product page.
// Sparse because legacy products may not have a slug; not unique because the
// scraped data may contain incidental duplicates we don't want to reject.
productSchema.index({ slug: 1 }, { sparse: true });
// Legacy string productId used by the pricing resolver fallback.
productSchema.index({ productId: 1 }, { sparse: true });
// Admin/storefront list is sorted by order then newest-first and filtered by category.
productSchema.index({ order: 1, createdAt: -1 });
productSchema.index({ categories: 1 });

module.exports = mongoose.model('Product', productSchema);
