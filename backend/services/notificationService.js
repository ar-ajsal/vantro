/* ============================================================================
   CHROMVAULT — PUSH NOTIFICATION SERVICE (FIREBASE ADMIN SDK)
   ----------------------------------------------------------------------------
   Dispatches push notifications to active Admin Command Center PWA devices.
   Credentials stay strictly server-side in environment variables.
   
   Order placement safety:
   Failures in Firebase or device delivery are caught, logged, and handled
   without ever rejecting or disrupting customer order creation.
   ========================================================================== */

const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const AdminPushToken = require('../models/AdminPushToken');

let isInitialized = false;

function initFirebase() {
  if (isInitialized) return true;
  if (admin.apps && admin.apps.length > 0) {
    isInitialized = true;
    return true;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '[NotificationService] Firebase Admin credentials not fully configured in environment.\n' +
      'Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.\n' +
      'Push notifications will remain idle until credentials are provided.'
    );
    return false;
  }

  try {
    // Handle escaped newlines from environment variables or .env files
    if (typeof privateKey === 'string') {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const certFn = (admin.credential && admin.credential.cert) || admin.cert;
    if (!certFn) {
      throw new Error('Firebase cert helper is unavailable in installed SDK.');
    }

    admin.initializeApp({
      credential: certFn({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey
      })
    });

    isInitialized = true;
    console.log(`[NotificationService] Firebase Admin SDK initialized for project "${projectId}".`);
    return true;
  } catch (err) {
    console.error('[NotificationService] Failed to initialize Firebase Admin SDK:', err.message);
    return false;
  }
}

// Stale / invalid token error codes from Firebase
const UNREGISTERED_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
]);

/**
 * Remove or disable invalid tokens from the database.
 */
async function cleanupTokens(tokensToDisable) {
  if (!tokensToDisable || !tokensToDisable.length) return;
  try {
    const res = await AdminPushToken.deleteMany({ token: { $in: tokensToDisable } });
    console.log(`[NotificationService] Pruned ${res.deletedCount} unregistered FCM token(s).`);
  } catch (err) {
    console.error('[NotificationService] Error pruning invalid tokens:', err.message);
  }
}

/**
 * Send real-time push notification when a customer order is placed.
 * Safe asynchronous function — never throws to caller.
 */
async function sendNewOrderNotification(order) {
  try {
    if (!initFirebase()) {
      return { success: false, reason: 'Firebase not configured' };
    }

    const tokens = await AdminPushToken.find({ enabled: true }).select('token adminId').lean();
    if (!tokens || tokens.length === 0) {
      console.log('[NotificationService] No active admin push tokens registered.');
      return { success: true, delivered: 0, total: 0 };
    }

    const orderNumber = String(order.orderId || order._id || '');
    const orderTotal = String(order.total != null ? order.total : 0);
    const orderIdStr = String(order._id || '');
    const customerName = String(order.customerName || 'Customer');

    const title = '🛍️ New Order';
    const body = `New order #${orderNumber} — ₹${orderTotal}`;

    // Note: FCM 'data' payload values must strictly be strings
    const message = {
      tokens: tokens.map((t) => t.token),
      notification: {
        title: title,
        body: body
      },
      data: {
        type: 'NEW_ORDER',
        orderId: orderIdStr,
        orderNumber: orderNumber,
        total: orderTotal,
        customerName: customerName,
        url: `/#/orders/${orderIdStr}`
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        notification: {
          title: title,
          body: body,
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: `order-${orderIdStr}`,
          requireInteraction: true,
          data: {
            url: `/#/orders/${orderIdStr}`,
            orderId: orderIdStr
          }
        },
        fcmOptions: {
          link: `/#/orders/${orderIdStr}`
        }
      }
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log(
      `[NotificationService] Order notification sent: ${response.successCount} succeeded, ${response.failureCount} failed.`
    );

    // Collect and prune any invalid or expired tokens
    const invalidTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (UNREGISTERED_CODES.has(code)) {
            invalidTokens.push(tokens[idx].token);
          } else {
            console.warn(`[NotificationService] FCM token error (${code}):`, resp.error.message);
          }
        }
      });
    }

    if (invalidTokens.length > 0) {
      cleanupTokens(invalidTokens);
    }

    return {
      success: true,
      delivered: response.successCount,
      failed: response.failureCount
    };
  } catch (err) {
    console.error('[NotificationService] Unexpected error sending order notification:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a test push notification to verified tokens of the requesting admin.
 */
async function sendTestNotification(adminId) {
  if (!initFirebase()) {
    throw new Error('Firebase Admin SDK is not configured on the server. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in the environment.');
  }

  const tokens = await AdminPushToken.find({ adminId: adminId, enabled: true }).select('token').lean();
  if (!tokens || tokens.length === 0) {
    throw new Error('No registered push tokens found for this admin. Please enable browser notifications first.');
  }

  const title = '🔔 Test Notification';
  const body = 'Chromvault Command Center push notifications are active and ready!';

  const message = {
    tokens: tokens.map((t) => t.token),
    notification: {
      title: title,
      body: body
    },
    data: {
      type: 'TEST_NOTIFICATION',
      url: '/#/settings'
    },
    webpush: {
      notification: {
        title: title,
        body: body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-notification',
        data: {
          url: '/#/settings'
        }
      }
    }
  };

  const response = await getMessaging().sendEachForMulticast(message);

  const invalidTokens = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error && UNREGISTERED_CODES.has(resp.error.code)) {
      invalidTokens.push(tokens[idx].token);
    }
  });

  if (invalidTokens.length > 0) {
    cleanupTokens(invalidTokens);
  }

  return {
    success: response.successCount > 0,
    delivered: response.successCount,
    failed: response.failureCount
  };
}

module.exports = {
  initFirebase,
  sendNewOrderNotification,
  sendTestNotification
};
