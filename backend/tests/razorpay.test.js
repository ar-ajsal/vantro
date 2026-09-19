/**
 * Razorpay Standard Checkout Integration Tests
 * Tests order creation, signature verification, and error handling.
 *
 * Run with: node tests/razorpay.test.js
 */
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

// Ensure env variables are set for testing
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.RAZORPAY_KEY_ID) {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_Tank3T5Igx1JuX';
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  process.env.RAZORPAY_KEY_SECRET = 'y7PChWGyeY5wart366eIwBY3';
}

const { createRazorpayOrder, verifyPaymentAndCreateOrder } = require('../controllers/orderController');

const app = express();
app.use(express.json());

// Mount the standard endpoints
app.post('/api/create-order', createRazorpayOrder);
app.post('/api/verify-payment', verifyPaymentAndCreateOrder);
app.use((req, res) => res.status(404).send({ message: 'Route not found.' }));

let PORT = 0;
function req(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: '127.0.0.1', port: PORT, path: p, method, headers: {} };
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, body: b, json });
      });
    });
    r.on('error', (e) => resolve({ status: 'ERR:' + e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
function check(name, got, want, detail) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${got} want ${want}]  ${name} ${detail ? '(' + detail + ')' : ''}`);
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  PORT = server.address().port;

  console.log('\n--- Running Razorpay Checkout Tests ---\n');

  // Test 1: Create Order with valid amount (50000 paise = ₹500)
  const orderRes = await req('POST', '/api/create-order', {
    amount: 50000,
    currency: 'INR',
    receipt: 'test_rcpt_' + Date.now()
  });
  check('POST /api/create-order valid amount -> 200', orderRes.status, 200);
  check('Response contains order_id', !!(orderRes.json && orderRes.json.order_id), true, orderRes.json && orderRes.json.order_id);
  check('Response contains correct amount', orderRes.json && orderRes.json.amount, 50000);
  check('Response contains currency', orderRes.json && orderRes.json.currency, 'INR');

  const orderId = orderRes.json ? orderRes.json.order_id : 'order_fake123';

  // Test 2: Create Order with amount < 100 paise -> 400
  const smallOrderRes = await req('POST', '/api/create-order', {
    amount: 50,
    currency: 'INR'
  });
  check('POST /api/create-order amount < 100 paise -> 400', smallOrderRes.status, 400);

  // Test 3: Create Order with empty body -> 400
  const emptyOrderRes = await req('POST', '/api/create-order', {});
  check('POST /api/create-order empty body -> 400', emptyOrderRes.status, 400);

  // Test 4: Verify Payment with missing fields -> 400
  const missingFieldsRes = await req('POST', '/api/verify-payment', {
    razorpay_order_id: orderId
  });
  check('POST /api/verify-payment missing fields -> 400', missingFieldsRes.status, 400);

  // Test 5: Verify Payment with valid HMAC-SHA256 signature -> 200
  const paymentId = 'pay_test_' + Date.now();
  const validSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const verifyValidRes = await req('POST', '/api/verify-payment', {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: validSignature
  });
  check('POST /api/verify-payment valid signature -> 200', verifyValidRes.status, 200);
  check('Verify response success: true', verifyValidRes.json && verifyValidRes.json.success, true);

  // Test 6: Verify Payment with invalid signature -> 400
  const verifyInvalidRes = await req('POST', '/api/verify-payment', {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: 'invalid_tampered_signature_12345'
  });
  check('POST /api/verify-payment invalid signature -> 400', verifyInvalidRes.status, 400);

  console.log(`\n=== Razorpay Tests: ${pass} passed, ${fail} failed ===\n`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
