/**
 * Auth wiring tests — no database or network required.
 * Stubs Mongoose model statics so only routing + middleware are exercised.
 *
 * Run with:  node tests/auth.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-auth-tests';

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');

const base = path.join(__dirname, '..');
const Admin = require(path.join(base, 'models/Admin'));
const Customer = require(path.join(base, 'models/Customer'));
const Product = require(path.join(base, 'models/Product'));
const Category = require(path.join(base, 'models/Category'));

// ── Stub DB access ──────────────────────────────────────────
let adminDoc = null;
let customerDoc = null;
Admin.findById = () => ({ select: async () => adminDoc });
Customer.findById = () => ({ select: async () => customerDoc });
Product.find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ populate: async () => [] }) }) }) });
Product.countDocuments = async () => 0;
Category.find = () => ({ sort: async () => [] });

const app = express();
app.use(express.json());
app.use('/v1/admin', require(path.join(base, 'routes/adminRoutes')));
app.use('/v1/products', require(path.join(base, 'routes/productRoutes')));
app.use('/v1/category', require(path.join(base, 'routes/categoryRoutes')));
app.use('/v1/customer', require(path.join(base, 'routes/customerRoutes')));
app.use('/v1/orders', require(path.join(base, 'routes/orderRoutes')));
app.use('/v1/cloudinary', require(path.join(base, 'routes/uploadRoutes')));

let PORT = 0;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: '127.0.0.1', port: PORT, path: p, method, headers: {} };
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    if (data) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request(opts, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode })); });
    r.on('error', (e) => resolve({ status: 'ERR:' + e.message }));
    if (data) r.write(data);
    r.end();
  });
}

const SECRET = process.env.JWT_SECRET;
const custTok = jwt.sign({ id: 'c1', type: 'customer' }, SECRET);
const adminTok = jwt.sign({ id: 'a1', type: 'admin' }, SECRET);
const wrongSig = jwt.sign({ id: 'a1', type: 'admin' }, 'not-the-secret');

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

  // Public reads
  check('GET /v1/products is public', (await req('GET', '/v1/products')).status, 200);
  check('GET /v1/category is public', (await req('GET', '/v1/category')).status, 200);

  // No token => 401
  for (const [m, p] of [
    ['GET', '/v1/orders'], ['GET', '/v1/orders/dashboard-count'], ['GET', '/v1/customer'],
    ['DELETE', '/v1/products/abc'], ['PATCH', '/v1/products/abc'], ['POST', '/v1/products/add'],
    ['POST', '/v1/category/add'], ['PUT', '/v1/orders/abc'], ['DELETE', '/v1/orders/abc'],
    ['POST', '/v1/cloudinary'], ['POST', '/v1/admin/register'],
  ]) {
    check(`${m} ${p} without token -> 401`, (await req(m, p, { body: {} })).status, 401);
  }

  // Bad signature => 401
  check('GET /v1/orders forged signature -> 401', (await req('GET', '/v1/orders', { token: wrongSig })).status, 401);

  // Customer token on admin routes => 403 (privilege escalation blocked)
  adminDoc = null; // customer id will never resolve to an Admin anyway
  for (const [m, p] of [
    ['GET', '/v1/orders'], ['DELETE', '/v1/products/abc'], ['POST', '/v1/admin/register'], ['GET', '/v1/customer'],
  ]) {
    check(`${m} ${p} with customer token -> 403`, (await req(m, p, { token: custTok, body: {} })).status, 403);
  }

  // Admin-type token whose id is not a real admin => 403
  check('GET /v1/orders admin-type token, unknown id -> 403', (await req('GET', '/v1/orders', { token: adminTok })).status, 403);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
