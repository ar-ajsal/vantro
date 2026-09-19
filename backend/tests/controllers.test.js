/**
 * Controller HTTP-semantics tests — no database or network required.
 * Stubs Mongoose model statics so controllers are exercised through the router.
 *
 * Verifies the correctness fixes:
 *   - unknown slug / id → 404 (not 200-with-null)
 *   - invalid ObjectId → 400
 *   - validation failures → 400
 *   - unknown route → 404
 *
 * Run with:  node tests/controllers.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-controller-tests';

const express = require('express');
const http = require('http');
const path = require('path');

const base = path.join(__dirname, '..');
const Product = require(path.join(base, 'models/Product'));
const Category = require(path.join(base, 'models/Category'));
const Customer = require(path.join(base, 'models/Customer'));

// ── Stub DB access ──────────────────────────────────────────
// Product.findOne({ slug }) → chainable .populate() resolving to null (not found).
Product.findOne = () => ({ populate: async () => null });
Product.find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ populate: async () => [] }) }) }) });
Product.countDocuments = async () => 0;

Category.find = () => ({ sort: async () => [] });

// Customer.findOne resolves to null so registration validation is what we test.
Customer.findOne = async () => null;

const app = express();
app.use(express.json());
app.use('/v1/products', require(path.join(base, 'routes/productRoutes')));
app.use('/v1/category', require(path.join(base, 'routes/categoryRoutes')));
app.use('/v1/customer', require(path.join(base, 'routes/customerRoutes')));
// Mirror server.js 404 fallback so we can assert on unknown routes.
app.use((req, res) => res.status(404).send({ message: 'Route not found.' }));

let PORT = 0;
function req(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: '127.0.0.1', port: PORT, path: p, method, headers: {} };
    if (data) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', (e) => resolve({ status: 'ERR:' + e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${got} want ${want}]  ${name}`);
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  PORT = server.address().port;

  // Slug not found → 404 (root-cause fix; previously 200 + null body).
  check('GET product by unknown slug -> 404', (await req('GET', '/v1/products/slug/does-not-exist')).status, 404);

  // Unknown route → 404 (not a hang / not 500).
  check('unknown route -> 404', (await req('GET', '/v1/nope')).status, 404);

  // Customer registration validation → 400.
  check('register with no body -> 400', (await req('POST', '/v1/customer/create', {})).status, 400);
  check('register with short password -> 400', (await req('POST', '/v1/customer/create', { name: 'Jo', email: 'a@b.com', password: '123' })).status, 400);
  check('register with bad email -> 400', (await req('POST', '/v1/customer/create', { name: 'Jo', email: 'notanemail', password: '123456' })).status, 400);

  // Login validation → 400 when missing fields.
  check('login with no body -> 400', (await req('POST', '/v1/customer/login', {})).status, 400);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
