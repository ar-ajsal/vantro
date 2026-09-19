/* ============================================================================
   CHROMVAULT — FIREBASE CLIENT CONFIGURATION
   ----------------------------------------------------------------------------
   Web push configuration for Firebase Cloud Messaging (FCM) in the Command
   Center PWA. Used by both the window context and the service worker.
   ========================================================================== */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    apiKey: "AIzaSyCH4YKyvETvdyGEWf_ZFIb-VbUBmZYBaCY",
    authDomain: "chromvault-f804e.firebaseapp.com",
    projectId: "chromvault-f804e",
    storageBucket: "chromvault-f804e.firebasestorage.app",
    messagingSenderId: "858396685129",
    appId: "1:858396685129:web:05c3a5bbc49fad1c2ca098"
  };

  var VAPID_KEY = "BML3FN9u89QMXnc1260q_ZE_ThBNBgqSt2dJOlzip5WpACbx-Ss8TeMxgsqsjbKXVlza95-_qhST2uJAK3ta6QE";

  // Allow environment injection from server or window override if configured
  var resolvedConfig = Object.assign(
    {},
    DEFAULT_CONFIG,
    (typeof global !== 'undefined' && global.__FIREBASE_CONFIG__) || {}
  );

  var customVapid = '';
  try {
    if (typeof localStorage !== 'undefined') {
      customVapid = localStorage.getItem('chromvault_vapid_key') || '';
    }
  } catch (e) {}

  var resolvedVapid = customVapid || (typeof global !== 'undefined' && global.__FIREBASE_VAPID_KEY__) || VAPID_KEY;

  var exportObj = {
    config: resolvedConfig,
    vapidKey: resolvedVapid
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
  if (typeof global !== 'undefined') {
    global.FIREBASE_WEB_CONFIG = exportObj;
  }
})(typeof self !== 'undefined' ? self : this);
