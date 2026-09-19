/**
 * Server-side pricing tests — no database or network required.
 * Stubs the Product model so computeOrderPricing is exercised in isolation.
 *
 * Verifies the payment-integrity guarantees:
 *   - totals come from the DB, never the client
 *   - client-supplied price / discount / shipping are ignored
 *   - unknown products are rejected (not billed at a client price)
 *   - insufficient stock is rejected
 *
 * Run with:  node tests/pricing.test.js
 */
const path = require('path');
const base = path.join(__dirname, '..');
const Product = require(path.join(base, 'models/Product'));

// ── Stub DB access ──────────────────────────────────────────
// A tiny in-memory catalogue keyed by _id string.
const CATALOGUE = {
  '507f1f77bcf86cd799439011': { _id: '507f1f77bcf86cd799439011', title: { en: 'Silver Ring' }, prices: { price: 1000 }, stock: 5, image: ['ring.jpg'] },
  '507f1f77bcf86cd799439012': { _id: '507f1f77bcf86cd799439012', title: { en: 'Gold Chain' }, prices: { price: 2500 }, stock: 2, image: ['chain.jpg'] },
  '507f1f77bcf86cd799439013': {
    _id: '507f1f77bcf86cd799439013',
    title: { en: 'Chrome Buds' },
    prices: { price: 899 },
    stock: 20,
    qtyPricing: [
      { minQty: 1, price: 899 },
      { minQty: 2, price: 849 },
      { minQty: 3, price: 799 }
    ],
    variants: [
      { title: 'Connector: Type-C', combination: { Connector: 'Type-C' }, price: 899, stock: 15 },
      { title: 'Connector: Lightning', combination: { Connector: 'Lightning' }, price: 899, stock: 5 },
      { title: 'Connector: Wireless', combination: { Connector: 'Wireless' }, price: 1099, stock: 2 }
    ]
  }
};
Product.findById = async (id) => CATALOGUE[String(id)] || null;
Product.findOne = async (q) => {
  if (q && q.productId) return Object.values(CATALOGUE).find((p) => p._id === q.productId) || null;
  if (q && q.slug) return null;
  return null;
};

const { computeOrderPricing, resolveUnitPrice } = require(path.join(base, 'utils/pricing'));

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
}

(async () => {
  // 1. Honest cart prices from DB, ignores client price.
  let r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439011', quantity: 2, price: 1 } // client claims price 1
  ]);
  check('subtotal comes from DB not client price', r.subTotal === 2000);
  check('total equals subtotal (free shipping, no discount)', r.total === 2000);
  check('discount forced to 0 server-side', r.discount === 0);
  check('shipping forced to 0 server-side', r.shippingFee === 0);
  check('line item price is DB price', r.lineItems[0].price === 1000);

  // 2. Multiple items summed from DB.
  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439011', quantity: 1 },
    { _id: '507f1f77bcf86cd799439012', quantity: 2 }
  ]);
  check('multi-item subtotal summed from DB', r.subTotal === 1000 + 2500 * 2);

  // 3. Unknown product is rejected, never billed at a client price.
  r = await computeOrderPricing([
    { _id: 'deadbeefdeadbeefdeadbeef', quantity: 1, price: 99999, name: 'Fake' }
  ]);
  check('unknown product rejected with error', !!r.error);
  check('unknown product produces no total', r.total === undefined);

  // 4. Insufficient stock rejected.
  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439012', quantity: 99 }
  ]);
  check('insufficient stock rejected', !!r.error);

  // 5. Empty cart rejected.
  r = await computeOrderPricing([]);
  check('empty cart rejected', !!r.error);

  // 6. Quantity is coerced to a sane positive integer.
  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439011', quantity: -3 }
  ]);
  check('non-positive quantity coerced to 1', r.subTotal === 1000);

  // 7. Quantity Tier Pricing applies dynamically.
  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439013', quantity: 2, variant: 'Connector: Type-C' }
  ]);
  check('quantity tier 2 applies ₹849 each', r.subTotal === 849 * 2);
  check('variant string preserved in line item', r.lineItems[0].variant === 'Connector: Type-C');

  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439013', quantity: 3, variant: 'Connector: Type-C' }
  ]);
  check('quantity tier 3 applies ₹799 each', r.subTotal === 799 * 3);

  // 8. Variant with custom price override (when no qty tiers or variant price is distinct)
  const budsProd = CATALOGUE['507f1f77bcf86cd799439013'];
  const pNoTiers = Object.assign({}, budsProd, { qtyPricing: [] });
  const customVariantPrice = resolveUnitPrice(pNoTiers, 1, 'Connector: Wireless');
  check('custom variant price overrides base price', customVariantPrice === 1099);

  // 9. Variant-specific stock validation
  r = await computeOrderPricing([
    { _id: '507f1f77bcf86cd799439013', quantity: 3, variant: 'Connector: Wireless' } // stock is 2
  ]);
  check('insufficient variant stock rejected', !!r.error);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
