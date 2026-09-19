/* ============================================================================
   Chromvault Command Center — core runtime
   - API client against the same-origin "/api" proxy (→ backend /v1)
   - Admin session: JWT stored in the "adminInfo" cookie (shared convention),
     sent as a Bearer token. 401/403 bounces to the in-app login screen.
   - Tiny helpers: DOM, formatting, toast, confirm modal.
   ========================================================================== */
(function (global) {
  'use strict';

  var API_BASE = '/api';

  // ---- Session --------------------------------------------------------------
  var Session = {
    get: function () {
      try {
        var m = document.cookie.match(/(?:^|;\s*)adminInfo=([^;]+)/);
        if (m) return JSON.parse(decodeURIComponent(m[1]));
      } catch (e) {}
      try {
        var ls = localStorage.getItem('adminInfo');
        if (ls) return JSON.parse(ls);
      } catch (e) {}
      return null;
    },
    set: function (info) {
      try { localStorage.setItem('adminInfo', JSON.stringify(info)); } catch (e) {}
      try {
        var val = encodeURIComponent(JSON.stringify(info));
        var exp = new Date(Date.now() + 30 * 864e5).toUTCString();
        document.cookie = 'adminInfo=' + val + '; path=/; expires=' + exp + '; SameSite=Lax';
      } catch (e) {}
    },
    clear: function () {
      try { localStorage.removeItem('adminInfo'); } catch (e) {}
      try { document.cookie = 'adminInfo=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; } catch (e) {}
    },
    token: function () { var i = this.get(); return i && i.token ? i.token : null; }
  };

  // ---- Fetch wrapper --------------------------------------------------------
  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    var t = Session.token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  var _onAuthFail = function () {};

  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = authHeaders(opts.raw ? {} : { 'Content-Type': 'application/json' });
    var init = { method: method, headers: headers };
    if (body != null) init.body = opts.raw ? body : JSON.stringify(body);

    return fetch(API_BASE + path, init).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        _onAuthFail();
        var e = new Error('Session expired. Please sign in again.');
        e.status = res.status;
        throw e;
      }
      var ct = res.headers.get('content-type') || '';
      var parse = ct.indexOf('application/json') >= 0 ? res.json() : res.text();
      return parse.then(function (data) {
        if (!res.ok) {
          var msg = (data && data.message) ? data.message : ('Request failed (' + res.status + ')');
          var err = new Error(msg); err.status = res.status; err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  var API = {
    base: API_BASE,
    onAuthFail: function (fn) { _onAuthFail = fn; },
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b); },
    put: function (p, b) { return request('PUT', p, b); },
    patch: function (p, b) { return request('PATCH', p, b); },
    del: function (p) { return request('DELETE', p); },
    delete: function (p) { return request('DELETE', p); },
    // Cloudinary upload (multipart; no JSON content-type)
    upload: function (file) {
      var fd = new FormData();
      fd.append('file', file);
      return request('POST', '/cloudinary', fd, { raw: true });
    },
    // Product image upload with background removal
    uploadProductImage: function (file) {
      var fd = new FormData();
      fd.append('file', file);
      return request('POST', '/cloudinary/removebg', fd, { raw: true });
    },
    // Login is public (no bounce on 401 — we show inline error instead)
    login: function (email, password) {
      return fetch(API_BASE + '/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.message || 'Invalid email or password.'); e.status = res.status; throw e; }
          return data;
        });
      });
    }
  };

  // ---- DOM helpers ----------------------------------------------------------
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---- Formatting -----------------------------------------------------------
  var INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  var INR2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var NUM = new Intl.NumberFormat('en-IN');

  function money(n, dec) { n = Number(n) || 0; return (dec ? INR2 : INR).format(n); }
  function num(n) { return NUM.format(Number(n) || 0); }
  function compact(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2).replace(/\.00$/, '') + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  function moneyCompact(n) { return '₹' + compact(n); }

  function timeAgo(date) {
    var d = new Date(date); var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var dd = Math.floor(h / 24); if (dd < 30) return dd + 'd ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function dateShort(date) {
    var d = new Date(date); if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dateLong(date) {
    var d = new Date(date); if (isNaN(d)) return '—';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function pct(cur, prev) {
    cur = Number(cur) || 0; prev = Number(prev) || 0;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  }
  // localized title: backend stores { en: "..." } objects for products/categories
  function locName(v, fallback) {
    if (v == null) return fallback || '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v.en || v.bn || Object.values(v)[0] || (fallback || '');
    return String(v);
  }

  // ---- Status maps ----------------------------------------------------------
  var ORDER_STATUS = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out For Delivery', 'Delivered', 'Cancelled', 'Returned'];
  function orderBadgeClass(s) {
    switch ((s || '').toLowerCase()) {
      case 'delivered': return 'ok';
      case 'paid': return 'ok';
      case 'confirmed': return 'violet';
      case 'processing': return 'info';
      case 'shipped': return 'info';
      case 'out for delivery': return 'info';
      case 'pending': return 'warn';
      case 'cancelled': return 'bad';
      case 'returned': return 'bad';
      case 'failed': return 'bad';
      default: return 'neutral';
    }
  }

  // ---- Toast ----------------------------------------------------------------
  function toast(msg, kind) {
    var stack = qs('#toastStack');
    if (!stack) { stack = el('div', { id: 'toastStack', class: 'toast-stack' }); document.body.appendChild(stack); }
    kind = kind || 'ok';
    var t = el('div', { class: 'toast ' + kind },
      global.icon(kind === 'bad' ? 'x-circle' : 'check-circle') + '<span>' + esc(msg) + '</span>');
    stack.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(20px)';
      setTimeout(function () { t.remove(); }, 320);
    }, 3200);
  }

  // ---- Confirm modal --------------------------------------------------------
  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var scrim = el('div', { class: 'modal-scrim' });
      scrim.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3>' + esc(opts.title || 'Are you sure?') + '</h3>' +
        '<p>' + esc(opts.body || '') + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn ghost" data-act="cancel">' + esc(opts.cancel || 'Cancel') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="ok">' + esc(opts.ok || 'Confirm') + '</button>' +
        '</div></div>';
      document.body.appendChild(scrim);
      requestAnimationFrame(function () { scrim.classList.add('open'); });
      function close(v) { scrim.classList.remove('open'); setTimeout(function () { scrim.remove(); }, 240); resolve(v); }
      scrim.addEventListener('click', function (e) {
        if (e.target === scrim) close(false);
        var act = e.target.closest('[data-act]'); if (!act) return;
        close(act.getAttribute('data-act') === 'ok');
      });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
      });
    });
  }

  // ---- Debounce -------------------------------------------------------------
  function debounce(fn, wait) {
    var t; return function () { var a = arguments, ctx = this; clearTimeout(t); t = setTimeout(function () { fn.apply(ctx, a); }, wait); };
  }

  // ---- Robust Clipboard Copy ------------------------------------------------
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, 99999);
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  // ---- Storefront URL Resolution --------------------------------------------
  function getStorefrontUrl() {
    var saved = localStorage.getItem('chromvault_storefront_url');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');

    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return window.location.protocol + '//' + host + ':3001';
    }

    if (host.endsWith('.vercel.app')) {
      var storeHost = host.replace(/-admin\b/i, '').replace(/\badmin-/i, '');
      if (storeHost !== host) {
        return window.location.protocol + '//' + storeHost;
      }
    }

    return window.location.origin;
  }

  global.CC = {
    API: API, Session: Session, authHeaders: authHeaders,
    el: el, esc: esc, qs: qs, qsa: qsa,
    money: money, num: num, compact: compact, moneyCompact: moneyCompact,
    timeAgo: timeAgo, dateShort: dateShort, dateLong: dateLong, pct: pct, locName: locName,
    ORDER_STATUS: ORDER_STATUS, orderBadgeClass: orderBadgeClass,
    toast: toast, confirmModal: confirmModal, debounce: debounce,
    copy: copy, getStorefrontUrl: getStorefrontUrl
  };
  global.Views = global.Views || {};
})(window);
