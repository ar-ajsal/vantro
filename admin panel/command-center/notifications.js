/* ============================================================================
   CHROMVAULT COMMAND CENTER — PUSH NOTIFICATIONS & REAL-TIME ALERTS
   ----------------------------------------------------------------------------
   Manages Firebase Cloud Messaging (FCM) on the client:
   - Permission handling (never spams on initial load)
   - FCM token registration with backend
   - Foreground notification popups with click-to-open order details
   - Audio chime for active admin sessions (Audio element + Web Audio API fallback)
   - Volume and mute preferences
   ========================================================================== */
(function (global) {
  'use strict';

  var CC = global.CC;
  var FIREBASE_WEB_CONFIG = global.FIREBASE_WEB_CONFIG || {};

  var audioContext = null;
  var cachedAudio = null;
  var isAudioUnlocked = false;

  // Sound settings defaults
  var soundEnabled = localStorage.getItem('cv_sound_enabled') !== 'false';
  var soundVolume = parseFloat(localStorage.getItem('cv_sound_volume') || '0.8');
  var orderAlertsEnabled = localStorage.getItem('cv_order_alerts') !== 'false';

  // Audio asset path
  var SOUND_URL = '/assets/sounds/order-notification.mp3';

  // Preload Audio element
  try {
    cachedAudio = new Audio(SOUND_URL);
    cachedAudio.volume = soundVolume;
    cachedAudio.preload = 'auto';
  } catch (e) {
    cachedAudio = null;
  }

  // Unlock audio playback on first user gesture to comply with browser autoplay policy
  function unlockAudio() {
    if (isAudioUnlocked) return;
    try {
      if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
      }
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
      if (cachedAudio) {
        // Silent play/pause to unlock HTML5 audio element
        var p = cachedAudio.play();
        if (p && p.then) {
          p.then(function () {
            cachedAudio.pause();
            cachedAudio.currentTime = 0;
            isAudioUnlocked = true;
          }).catch(function () {});
        }
      } else {
        isAudioUnlocked = true;
      }
    } catch (e) {}
  }

  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });

  /**
   * Synthesize luxury two-tone chime via Web Audio API
   */
  function playSynthesizedChime(vol) {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume();

      var now = audioContext.currentTime;
      var gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, vol), now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      gainNode.connect(audioContext.destination);

      // Tone 1: 587.33 Hz (D5)
      var osc1 = audioContext.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.connect(gainNode);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // Tone 2: 880.00 Hz (A5)
      var osc2 = audioContext.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.2);
      osc2.connect(gainNode);
      osc2.start(now + 0.2);
      osc2.stop(now + 1.4);
    } catch (err) {
      console.warn('[Notifications] Synthesizer audio error:', err);
    }
  }

  /**
   * Play the custom order notification ringtone
   */
  function playOrderSound() {
    if (!soundEnabled) return;
    var vol = Math.max(0, Math.min(1, soundVolume));

    if (cachedAudio) {
      cachedAudio.volume = vol;
      cachedAudio.currentTime = 0;
      var promise = cachedAudio.play();
      if (promise && promise.catch) {
        promise.catch(function () {
          // Autoplay blocked or asset error: fallback to Web Audio API
          playSynthesizedChime(vol);
        });
      }
    } else {
      playSynthesizedChime(vol);
    }
  }

  // Device detection helper
  function getDeviceDescription() {
    var ua = navigator.userAgent;
    var dev = 'Desktop Browser';
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
      dev = /iPad|iPhone/i.test(ua) ? 'iOS Device' : 'Android Mobile';
    } else if (/Mac/i.test(ua)) {
      dev = 'macOS Desktop';
    } else if (/Win/i.test(ua)) {
      dev = 'Windows PC';
    } else if (/Linux/i.test(ua)) {
      dev = 'Linux Desktop';
    }
    return dev;
  }

  var messaging = null;

  function initFirebaseMessaging() {
    if (messaging) return Promise.resolve(messaging);
    if (typeof firebase === 'undefined' || !firebase.messaging) {
      return Promise.reject(new Error('Firebase Messaging SDK not loaded'));
    }

    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(FIREBASE_WEB_CONFIG.config);
      }
      messaging = firebase.messaging();
      setupForegroundListener(messaging);
      return Promise.resolve(messaging);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * Foreground Push Notification Handler
   */
  function setupForegroundListener(msg) {
    if (!msg || !msg.onMessage) return;

    msg.onMessage(function (payload) {
      console.log('[FCM] Foreground push message received:', payload);
      var data = payload.data || {};
      var notification = payload.notification || {};

      var type = data.type || 'NEW_ORDER';
      var orderId = data.orderId || '';
      var orderNumber = data.orderNumber || orderId || 'Order';
      var total = data.total || '';
      var title = notification.title || '🛍️ New Order';
      var body = notification.body || (orderNumber ? 'New order #' + orderNumber : 'New order received');

      if (type === 'NEW_ORDER') {
        if (orderAlertsEnabled) {
          playOrderSound();
          showActiveOrderToast({
            orderId: orderId,
            orderNumber: orderNumber,
            total: total,
            customerName: data.customerName || ''
          });
        }
        // Increment or set orders badge in navigation
        if (global.App && global.App.setBadge) {
          var current = (global.App.state && global.App.state.badges && global.App.state.badges.orders) || 0;
          global.App.setBadge('orders', current + 1);
        }
      } else {
        // Standard or test notification
        playOrderSound();
        if (CC && CC.toast) {
          CC.toast(body, 'ok');
        }
      }
    });
  }

  /**
   * Custom High-Fidelity Active Order Toast for Command Center
   */
  function showActiveOrderToast(details) {
    var stack = document.querySelector('#toastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }

    var orderId = details.orderId;
    var orderNum = details.orderNumber;
    var formattedTotal = details.total ? '₹' + details.total : '';

    var card = document.createElement('div');
    card.className = 'active-order-card';
    card.setAttribute('role', 'alert');
    card.innerHTML =
      '<div class="aoc-head">' +
      '  <span class="aoc-tag"><i class="aoc-dot"></i>NEW ORDER</span>' +
      '  <span class="aoc-time">Just now</span>' +
      '</div>' +
      '<div class="aoc-main">' +
      '  <div class="aoc-id">#' + (CC ? CC.esc(orderNum) : orderNum) + '</div>' +
      '  <div class="aoc-total">' + (CC ? CC.esc(formattedTotal) : formattedTotal) + '</div>' +
      '</div>' +
      (details.customerName ? '<div class="aoc-sub">Customer: ' + (CC ? CC.esc(details.customerName) : details.customerName) + '</div>' : '') +
      '<div class="aoc-action">Click to view order details &rarr;</div>';

    card.addEventListener('click', function () {
      card.remove();
      if (orderId) {
        if (global.Views && global.Views.orders && global.Views.orders.open) {
          global.Views.orders.open(orderId);
        } else if (global.App && global.App.navigate) {
          global.App.navigate('orders', { id: orderId });
        } else {
          location.hash = '#/orders/' + encodeURIComponent(orderId);
        }
      }
    });

    stack.appendChild(card);

    // Slide out after 9 seconds
    setTimeout(function () {
      card.style.transition = 'opacity 0.4s, transform 0.4s';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px)';
      setTimeout(function () { card.remove(); }, 400);
    }, 9000);
  }

  /**
   * Request Notification Permission & Register FCM Token
   */
  function enableNotifications() {
    if (!('Notification' in window)) {
      return Promise.reject(new Error('This browser does not support desktop notifications.'));
    }

    return Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') {
        throw new Error('Notification permission was not granted (' + permission + ').');
      }

      return initFirebaseMessaging();
    }).then(function (msg) {
      return navigator.serviceWorker.ready.then(function (registration) {
        var vapid = (FIREBASE_WEB_CONFIG && FIREBASE_WEB_CONFIG.vapidKey) || '';
        try {
          var customVapid = localStorage.getItem('chromvault_vapid_key');
          if (customVapid && customVapid.trim()) vapid = customVapid.trim();
        } catch (e) {}

        var opts = { serviceWorkerRegistration: registration };
        if (vapid) opts.vapidKey = vapid;
        return msg.getToken(opts);
      });
    }).then(function (token) {
      if (!token) throw new Error('Could not retrieve FCM device token.');

      localStorage.setItem('cv_fcm_token', token);
      console.log('[FCM] Token retrieved successfully.');

      // Register with backend
      if (CC && CC.API) {
        return CC.API.post('/admin/notifications/register', {
          token: token,
          device: getDeviceDescription(),
          userAgent: navigator.userAgent
        }).then(function () {
          return { success: true, token: token };
        });
      }
      return { success: true, token: token };
    });
  }

  /**
   * Disable Notifications
   */
  function disableNotifications() {
    var token = localStorage.getItem('cv_fcm_token');
    localStorage.removeItem('cv_fcm_token');

    if (token && CC && CC.API) {
      return CC.API.post('/admin/notifications/unregister', { token: token }).catch(function () {});
    }
    return Promise.resolve();
  }

  /**
   * Test Push Notification
   */
  function sendTestNotification() {
    if (!CC || !CC.API) return Promise.reject(new Error('API client not ready'));
    return CC.API.post('/admin/notifications/test', {});
  }

  // Public API
  global.Notifications = {
    isSupported: function () {
      return 'Notification' in window && 'serviceWorker' in navigator;
    },
    getPermissionStatus: function () {
      return ('Notification' in window) ? Notification.permission : 'unsupported';
    },
    isEnabled: function () {
      return ('Notification' in window) && Notification.permission === 'granted' && !!localStorage.getItem('cv_fcm_token');
    },
    enable: enableNotifications,
    disable: disableNotifications,
    test: sendTestNotification,
    playOrderSound: playOrderSound,
    testSound: function () {
      unlockAudio();
      playOrderSound();
    },
    isSoundEnabled: function () { return soundEnabled; },
    setSoundEnabled: function (val) {
      soundEnabled = !!val;
      localStorage.setItem('cv_sound_enabled', soundEnabled ? 'true' : 'false');
    },
    getSoundVolume: function () { return soundVolume; },
    setSoundVolume: function (vol) {
      soundVolume = Math.max(0, Math.min(1, parseFloat(vol)));
      localStorage.setItem('cv_sound_volume', String(soundVolume));
      if (cachedAudio) cachedAudio.volume = soundVolume;
    },
    isOrderAlertsEnabled: function () { return orderAlertsEnabled; },
    setOrderAlertsEnabled: function (val) {
      orderAlertsEnabled = !!val;
      localStorage.setItem('cv_order_alerts', orderAlertsEnabled ? 'true' : 'false');
    },
    init: function () {
      // If already granted and token exists, silently refresh / ensure listener is active
      if (('Notification' in window) && Notification.permission === 'granted') {
        initFirebaseMessaging().catch(function () {});
      }
    }
  };

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      global.Notifications.init();
    });
  } else {
    global.Notifications.init();
  }
})(window);
