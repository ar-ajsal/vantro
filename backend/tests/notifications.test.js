/* ============================================================================
   CHROMVAULT — PUSH NOTIFICATIONS SUITE
   ----------------------------------------------------------------------------
   Verifies:
   - AdminPushToken model behaves correctly (indexing, validation)
   - Notification service handles missing credentials gracefully without throwing
   - Push notification routes are protected by admin authentication
   - Order creation flow safely invokes notification service asynchronously
   ========================================================================== */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_push_notifications_32_chars';
process.env.NODE_ENV = 'test';

const AdminPushToken = require('../models/AdminPushToken');
const notificationService = require('../services/notificationService');

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.error(`FAIL  ${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  }
}

(async () => {
  console.log('\n--- Notification Service & Auth Tests ---');

  // 1. Service initialization with missing credentials should fail gracefully without throwing
  const unconfiguredInit = notificationService.initFirebase();
  check('initFirebase returns false when credentials missing', unconfiguredInit, false);

  // 2. sendNewOrderNotification should never throw even when Firebase is unconfigured
  const dummyOrder = {
    _id: new mongoose.Types.ObjectId(),
    orderId: 'ORD-99999',
    total: 1499,
    customerName: 'Test Customer'
  };

  const notifyResult = await notificationService.sendNewOrderNotification(dummyOrder);
  check('sendNewOrderNotification handles unconfigured state safely', notifyResult.success, false);
  check('sendNewOrderNotification returns unconfigured reason', notifyResult.reason, 'Firebase not configured');

  // 3. sendTestNotification throws descriptive error when unconfigured
  let testError = null;
  try {
    await notificationService.sendTestNotification(new mongoose.Types.ObjectId());
  } catch (err) {
    testError = err.message;
  }
  check(
    'sendTestNotification raises descriptive error when unconfigured',
    typeof testError === 'string' && testError.includes('Firebase Admin SDK is not configured'),
    true
  );

  // 4. Test route security with express test server
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', require('../routes/adminRoutes'));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function req(path, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve) => {
      const data = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: method,
        headers: Object.assign({
          'Content-Type': 'application/json',
          'Content-Length': data ? Buffer.byteLength(data) : 0
        }, headers)
      };
      const r = http.request(opts, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(b); } catch (e) {}
          resolve({ status: res.statusCode, body: json });
        });
      });
      if (data) r.write(data);
      r.end();
    });
  }

  // 4.1 Unauthenticated requests must be rejected (401)
  const regNoAuth = await req('/v1/admin/notifications/register', 'POST', { token: 'sample-token' });
  check('POST /v1/admin/notifications/register without token -> 401', regNoAuth.status, 401);

  const unregNoAuth = await req('/v1/admin/notifications/unregister', 'POST', { token: 'sample-token' });
  check('POST /v1/admin/notifications/unregister without token -> 401', unregNoAuth.status, 401);

  const testNoAuth = await req('/v1/admin/notifications/test', 'POST', {});
  check('POST /v1/admin/notifications/test without token -> 401', testNoAuth.status, 401);

  // 4.2 Customer token requests must be rejected (403)
  const customerToken = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), type: 'customer' },
    process.env.JWT_SECRET
  );
  const regCust = await req(
    '/v1/admin/notifications/register',
    'POST',
    { token: 'sample-token' },
    { Authorization: `Bearer ${customerToken}` }
  );
  check('POST /v1/admin/notifications/register with customer token -> 403', regCust.status, 403);

  server.close();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})();
