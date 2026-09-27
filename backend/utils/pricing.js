const mongoose = require('mongoose');
const Product = require('../models/Product');
const Setting = require('../models/Setting');

/**
 * Resolve a cart line to a real Product document.
 * Accepts Mongo _id, legacy string productId, or slug — never trusts a client price.
 */
async function findProduct(item) {
  const id = item._id || item.id || item.productId;
  let product = null;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    product = await Product.findById(id);
  }
  if (!product && id) {
    product = await Product.findOne({ productId: String(id) });
  }
  if (!product && item.slug) {
    product = await Product.findOne({ slug: item.slug });
  }
  return product;
}

// ─── Server-side money policy ──────────────────────────────
// Central place for shipping / discount rules.
// Rules are loaded from Setting (key: 'delivery_rules') with cache & sensible defaults:
// - Kerala: Always free delivery (₹0)
// - Outside Kerala: Free if order value >= outsideKeralaMinFreeOrder, else outsideKeralaDeliveryFee
let _cachedDeliveryRules = null;
let _cachedRulesTime = 0;
const RULES_CACHE_TTL = 15000; // 15 seconds

async function getDeliveryRules() {
  const now = Date.now();
  if (_cachedDeliveryRules && (now - _cachedRulesTime < RULES_CACHE_TTL)) {
    return _cachedDeliveryRules;
  }
  const defaults = {
    keralaDeliveryFee: 0,
    outsideKeralaMinFreeOrder: 999,
    outsideKeralaDeliveryFee: 50
  };
  if (mongoose.connection.readyState !== 1) {
    return defaults;
  }
  try {
    const doc = await Setting.findOne({ key: 'delivery_rules' }).maxTimeMS(2000).exec();
    if (doc && doc.value && typeof doc.value === 'object') {
      _cachedDeliveryRules = {
        keralaDeliveryFee: Number(doc.value.keralaDeliveryFee ?? 0),
        outsideKeralaMinFreeOrder: Number(doc.value.outsideKeralaMinFreeOrder ?? 999),
        outsideKeralaDeliveryFee: Number(doc.value.outsideKeralaDeliveryFee ?? 50)
      };
    } else {
      _cachedDeliveryRules = defaults;
    }
  } catch (err) {
    _cachedDeliveryRules = defaults;
  }
  _cachedRulesTime = now;
  return _cachedDeliveryRules;
}

async function computeShipping(subTotal, deliveryAddress) {
  if (!deliveryAddress) {
    return 0; // default for cart calculation before address is entered
  }
  const rules = await getDeliveryRules();
  const stateStr = (deliveryAddress.state || '').trim().toLowerCase();
  const zipStr = String(deliveryAddress.zip || '').trim();

  // Check if Kerala
  const isKerala = stateStr.includes('kerala') || stateStr === 'kl' || (!stateStr && /^(67|68|69)\d{4}$/.test(zipStr));
  if (isKerala) {
    return Number(rules.keralaDeliveryFee) || 0;
  }

  // Outside Kerala: free if subtotal >= threshold, else flat fee
  const threshold = Number(rules.outsideKeralaMinFreeOrder) || 0;
  const fee = Number(rules.outsideKeralaDeliveryFee) || 0;

  if (threshold > 0 && subTotal >= threshold) {
    return 0;
  }
  return fee;
}

function computeDiscount(/* subTotal, lineItems */) {
  return 0;
}

/**
 * Find a matching combination variant on a product document.
 */
function findMatchingVariant(product, variantString, variantId) {
  if (!product || !Array.isArray(product.variants) || !product.variants.length) return null;
  if (variantId) {
    const byId = product.variants.find(v => v && (String(v._id) === String(variantId) || String(v.id) === String(variantId)));
    if (byId) return byId;
  }
  if (!variantString) return null;
  const target = String(variantString).trim().toLowerCase();
  
  for (const v of product.variants) {
    if (!v || typeof v !== 'object') continue;
    if (v.title && String(v.title).trim().toLowerCase() === target) return v;
    if (v.variant && String(v.variant).trim().toLowerCase() === target) return v;
    if (v.sku && String(v.sku).trim().toLowerCase() === target) return v;
    if (v.combination && typeof v.combination === 'object') {
      const parts = Object.keys(v.combination).map(k => `${k}: ${v.combination[k]}`).join(', ').toLowerCase();
      if (parts === target) return v;
      const slashParts = Object.values(v.combination).map(val => String(val).trim().toLowerCase()).join(' / ');
      if (slashParts === target) return v;
    }
  }
  return null;
}

/**
 * Resolve the authoritative unit price for a given product + quantity + variant.
 * 1. If the product has combination variants and a matching variant has a custom price,
 *    that price is used as the base unit price.
 * 2. If the product has quantity-tier pricing (qtyPricing), the highest tier
 *    whose minQty <= qty is applied.
 * 3. Otherwise falls back to product.prices.price.
 */
function resolveUnitPrice(product, qty, variantString, variantId) {
  const matchedVariant = findMatchingVariant(product, variantString, variantId);
  let basePrice = product.prices?.price || product.prices?.originalPrice || 0;
  if (matchedVariant && typeof matchedVariant.price === 'number' && matchedVariant.price > 0) {
    basePrice = matchedVariant.price;
  }

  const tiers = Array.isArray(product.qtyPricing) ? product.qtyPricing : [];
  if (tiers.length > 0) {
    const sorted = tiers.slice().sort((a, b) => b.minQty - a.minQty);
    for (const tier of sorted) {
      if (qty >= tier.minQty) return Number(tier.price);
    }
  }
  return basePrice;
}

/**
 * Compute authoritative order pricing from the DB.
 * Returns { error } on any problem, otherwise
 * { subTotal, discount, shippingFee, total, lineItems }.
 *
 * `lineItems` are safe, server-built cart entries (price/name/image/variant from DB).
 * This single function is the source of truth for BOTH the Razorpay order
 * amount and the persisted order total, so they can never diverge.
 */
async function computeOrderPricing(cart, deliveryAddress) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { error: 'Your cart is empty.' };
  }

  let subTotal = 0;
  const lineItems = [];

  for (const item of cart) {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const product = await findProduct(item);

    if (!product) {
      return {
        error: `Product is no longer available: ${item.name || item.title || item._id || 'unknown item'}. Please remove it from your cart.`
      };
    }

    const variant = typeof item.variant === 'string' ? item.variant.trim() : '';
    const variantId = item.variantId || item.combinationId || null;
    const matchedVariant = findMatchingVariant(product, variant, variantId);

    // Stock check: if matched variant tracks stock, check against variant stock
    if (matchedVariant && typeof matchedVariant.stock === 'number' && matchedVariant.stock < qty) {
      const title = typeof product.title === 'object' ? product.title.en : product.title;
      return { error: `Insufficient stock for ${title} (${variant || 'selected option'}). Only ${matchedVariant.stock} left.` };
    } else if (typeof product.stock === 'number' && product.stock < qty) {
      const title = typeof product.title === 'object' ? product.title.en : product.title;
      return { error: `Insufficient stock for: ${title}. Only ${product.stock} left.` };
    }

    // Authoritative unit price — applies variant price & qty tier if configured.
    const price = resolveUnitPrice(product, qty, variant, variantId);
    subTotal += price * qty;

    const name = typeof product.title === 'object'
      ? (product.title.en || 'Product')
      : (product.title || 'Product');
    const image = (matchedVariant && matchedVariant.image) || (Array.isArray(product.image) ? product.image[0] : (product.image || item.image || ''));

    lineItems.push({
      productId: product._id,
      name,
      image,
      variant,
      quantity: qty,
      price
    });
  }

  const discount = computeDiscount(subTotal, lineItems);
  const shippingFee = await computeShipping(subTotal, deliveryAddress);
  const total = subTotal - discount + shippingFee;

  return { subTotal, discount, shippingFee, total, lineItems };
}

module.exports = { computeOrderPricing, findProduct, resolveUnitPrice, findMatchingVariant, computeShipping, getDeliveryRules };
