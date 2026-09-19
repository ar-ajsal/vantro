/* ============================================================================
   Chromvault Command Center — app shell runtime
   - Hash router (#/dashboard, #/orders, …) with a view registry
   - Auth gate: no session → login screen; API 401/403 → bounce back to login
   - Sidebar + bottom-nav rendering, breadcrumbs, sidebar collapse (persisted)
   - CMD+K command palette (navigate + quick actions)
   ========================================================================== */
(function (global) {
  'use strict';

  var CC = global.CC, UI = global.UI, icon = global.icon;
  var qs = CC.qs, qsa = CC.qsa, esc = CC.esc;

  // ---- Route registry -------------------------------------------------------
  // Each view module registers itself on window.Views[name] = { title, render(rootEl, params) }.
  global.Views = global.Views || {};

  var NAV = [
    { section: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'orders', label: 'Orders', icon: 'cart' },
    { section: 'Catalog' },
    { id: 'products', label: 'Products', icon: 'box' },
    { id: 'categories', label: 'Categories', icon: 'layers' },
    { id: 'reviews', label: 'Reviews', icon: 'star' },
    { section: 'People' },
    { id: 'customers', label: 'Customers', icon: 'users' },
    { section: 'System' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];
  // Primary destinations for the mobile bottom bar
  var BOTTOM = ['dashboard', 'orders', 'products', 'customers'];

  var state = { route: 'dashboard', params: {}, badges: {} };

  // ---- Auth -----------------------------------------------------------------
  function showLogin(msg) {
    var app = qs('#app'); if (app) { app.hidden = true; app.style.display = 'none'; }
    var ls = qs('#loginScreen'); if (ls) { ls.hidden = false; ls.style.display = 'grid'; }
    var err = qs('#loginErr');
    if (msg) { err.textContent = msg; err.classList.add('show'); }
    else { err.classList.remove('show'); }
    var email = qs('#loginEmail'); if (email) email.focus();
  }

  function showApp() {
    var ls = qs('#loginScreen'); if (ls) { ls.hidden = true; ls.style.display = 'none'; }
    var app = qs('#app'); if (app) { app.hidden = false; app.style.display = ''; }
    var info = CC.Session.get() || {};
    var name = info.name || 'Admin';
    if (typeof name === 'object' && name !== null) {
      name = name.en || Object.values(name)[0] || 'Admin';
    }
    qs('#userName').textContent = name;
    qs('#userRole').textContent = (info.role || 'admin').toString();
    qs('#userAvatar').textContent = (name.trim()[0] || 'A').toUpperCase();
  }

  function bindLogin() {
    var form = qs('#loginForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = qs('#loginBtn');
      var email = qs('#loginEmail').value.trim();
      var password = qs('#loginPassword').value;
      if (!email || !password) return showLogin('Enter both email and password.');
      btn.disabled = true; btn.textContent = 'Signing in…';
      CC.API.login(email, password).then(function (data) {
        if (!data || !data.token) throw new Error('No token returned.');
        CC.Session.set(data);
        qs('#loginErr').classList.remove('show');
        showApp();
        boot();
      }).catch(function (err) {
        showLogin(err.message || 'Invalid email or password.');
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Sign in';
      });
    });
  }

  function logout() {
    CC.Session.clear();
    showLogin();
  }

  // ---- Sidebar / nav --------------------------------------------------------
  function renderNav() {
    var nav = qs('#navList');
    nav.innerHTML = NAV.map(function (item) {
      if (item.section) return '<div class="nav-section">' + esc(item.section) + '</div>';
      var badge = state.badges[item.id];
      return '<a class="nav-item" data-route="' + item.id + '" href="#/' + item.id + '">' +
        icon(item.icon) +
        '<span class="lbl">' + esc(item.label) + '</span>' +
        (badge ? '<span class="nav-badge">' + esc(String(badge)) + '</span>' : '') +
        '</a>';
    }).join('');

    var bn = qs('#bottomNav');
    bn.innerHTML = BOTTOM.map(function (id) {
      var item = NAV.find(function (x) { return x.id === id; });
      return '<a class="bn-item" data-route="' + id + '" href="#/' + id + '">' +
        icon(item.icon) + '<span>' + esc(item.label) + '</span></a>';
    }).join('');
  }

  function setActiveNav() {
    qsa('.nav-item, .bn-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === state.route);
    });
  }

  function setBadge(route, count) {
    state.badges[route] = count && count > 0 ? count : 0;
    renderNav(); setActiveNav();
  }
  CC.setBadge = setBadge;

  // ---- Breadcrumbs ----------------------------------------------------------
  function setCrumbs(parts) {
    qs('#crumbs').innerHTML = parts.map(function (p, i) {
      var last = i === parts.length - 1;
      return (last ? '<b>' + esc(p) + '</b>' : esc(p)) +
        (last ? '' : icon('chevron-right'));
    }).join('');
  }

  // ---- Router ---------------------------------------------------------------
  function parseHash() {
    var h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    var seg = h.split('/');
    var route = seg[0] || 'dashboard';
    var params = {};
    if (seg[1]) params.id = decodeURIComponent(seg[1]);
    // querystring after "?"
    var q = h.indexOf('?');
    if (q >= 0) {
      route = h.slice(0, q).split('/')[0];
      new URLSearchParams(h.slice(q + 1)).forEach(function (v, k) { params[k] = v; });
    }
    return { route: route, params: params };
  }

  function navigate(route, params) {
    var hash = '#/' + route + (params && params.id ? '/' + encodeURIComponent(params.id) : '');
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    var parsed = parseHash();
    var view = global.Views[parsed.route];
    if (!view) { parsed.route = 'dashboard'; view = global.Views.dashboard; }
    state.route = parsed.route; state.params = parsed.params;

    setActiveNav();
    var crumbText = (view && (view.crumb || view.title)) || parsed.route;
    if (parsed.params && parsed.params.id) {
      setCrumbs(['Chromvault', crumbText, 'Order Details']);
    } else {
      setCrumbs(['Chromvault', crumbText]);
    }
    closeSidebarMobile();

    var root = qs('#view');
    root.innerHTML = '';
    qs('#viewport').scrollTop = 0;
    if (!view || typeof view.render !== 'function') {
      root.innerHTML = UI.errorState('View not found: ' + parsed.route);
      return;
    }
    try {
      view.render(root, parsed.params);
    } catch (e) {
      root.innerHTML = UI.errorState(e.message);
      console.error('[view:' + parsed.route + ']', e);
    }
  }

  // ---- Sidebar collapse + mobile --------------------------------------------
  function initSidebar() {
    var sidebar = qs('#sidebar');
    var collapsed = false;
    try { collapsed = localStorage.getItem('cc.sidebar') === '1'; } catch (e) {}
    if (collapsed) sidebar.classList.add('collapsed');

    qs('#toggleSidebar').addEventListener('click', function () {
      sidebar.classList.toggle('collapsed');
      try { localStorage.setItem('cc.sidebar', sidebar.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
    });
    qs('#openSidebar').addEventListener('click', function () {
      sidebar.classList.add('mobile-open');
      qs('#sidebarScrim').classList.add('open');
    });
    qs('#sidebarScrim').addEventListener('click', closeSidebarMobile);
  }
  function closeSidebarMobile() {
    qs('#sidebar').classList.remove('mobile-open');
    qs('#sidebarScrim').classList.remove('open');
  }

  // ---- Command palette ------------------------------------------------------
  var CMD = [];
  function buildCommands() {
    CMD = [
      { group: 'Navigate', title: 'Dashboard', hint: 'Overview', icon: 'grid', run: function () { navigate('dashboard'); } },
      { group: 'Navigate', title: 'Orders', hint: 'All orders', icon: 'cart', run: function () { navigate('orders'); } },
      { group: 'Navigate', title: 'Products', hint: 'Catalog', icon: 'box', run: function () { navigate('products'); } },
      { group: 'Navigate', title: 'Categories', hint: 'Catalog', icon: 'layers', run: function () { navigate('categories'); } },
      { group: 'Navigate', title: 'Reviews', hint: 'Feedback & ratings', icon: 'star', run: function () { navigate('reviews'); } },
      { group: 'Navigate', title: 'Customers', hint: 'People', icon: 'users', run: function () { navigate('customers'); } },
      { group: 'Navigate', title: 'Settings', hint: 'System', icon: 'settings', run: function () { navigate('settings'); } },
      { group: 'Actions', title: 'New product', hint: 'Create', icon: 'plus', run: function () { navigate('products', {}); setTimeout(function () { if (global.Views.products.openEditor) global.Views.products.openEditor(); }, 60); } },
      { group: 'Actions', title: 'Pending orders', hint: 'Filter', icon: 'clock', run: function () { navigate('orders', { status: 'Pending' }); } },
      { group: 'Actions', title: 'Pending reviews', hint: 'Moderate', icon: 'star', run: function () { navigate('reviews', {}); } },
      { group: 'Actions', title: 'Refresh view', hint: 'Reload data', icon: 'refresh', run: function () { render(); } },
      { group: 'Actions', title: 'Sign out', hint: 'End session', icon: 'log-out', run: function () { logout(); } }
    ];
  }

  var cmdSel = 0, cmdFiltered = [];
  function openCmd() {
    var scrim = qs('#cmdkScrim');
    scrim.classList.add('open');
    var input = qs('#cmdkInput');
    input.value = ''; filterCmd(''); input.focus();
  }
  function closeCmd() { qs('#cmdkScrim').classList.remove('open'); }
  function filterCmd(term) {
    term = (term || '').toLowerCase().trim();
    cmdFiltered = CMD.filter(function (c) {
      return !term || c.title.toLowerCase().indexOf(term) >= 0 || (c.group + '').toLowerCase().indexOf(term) >= 0;
    });
    cmdSel = 0;
    renderCmd();
  }
  function renderCmd() {
    var list = qs('#cmdkList');
    if (!cmdFiltered.length) { list.innerHTML = '<div class="cmdk-empty">No matching commands</div>'; return; }
    var html = '', lastGroup = null;
    cmdFiltered.forEach(function (c, i) {
      if (c.group !== lastGroup) { html += '<div class="cmdk-group">' + esc(c.group) + '</div>'; lastGroup = c.group; }
      html += '<div class="cmdk-item' + (i === cmdSel ? ' sel' : '') + '" data-idx="' + i + '">' +
        icon(c.icon) + '<span class="ci-title">' + esc(c.title) + '</span>' +
        '<span class="ci-hint">' + esc(c.hint || '') + '</span></div>';
    });
    list.innerHTML = html;
  }
  function runCmd(i) {
    var c = cmdFiltered[i]; if (!c) return;
    closeCmd(); c.run();
  }
  function initCmd() {
    buildCommands();
    qs('#cmdSearchIc').innerHTML = icon('search');
    qs('#cmdkIc').innerHTML = icon('command');
    qs('#cmdTrigger').addEventListener('click', openCmd);
    var input = qs('#cmdkInput');
    input.addEventListener('input', function () { filterCmd(input.value); });
    qs('#cmdkList').addEventListener('click', function (e) {
      var it = e.target.closest('[data-idx]'); if (it) runCmd(+it.getAttribute('data-idx'));
    });
    qs('#cmdkScrim').addEventListener('click', function (e) { if (e.target === qs('#cmdkScrim')) closeCmd(); });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
      if (!qs('#cmdkScrim').classList.contains('open')) return;
      if (e.key === 'Escape') { closeCmd(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdFiltered.length - 1); renderCmd(); scrollSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); renderCmd(); scrollSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSel); }
    });
  }
  function scrollSel() {
    var sel = qs('.cmdk-item.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // ---- Boot -----------------------------------------------------------------
  function boot() {
    // Live order badge: fetch pending count once on boot (best-effort).
    CC.API.get('/orders?status=Pending&limit=1').then(function (d) {
      setBadge('orders', d && d.totalDoc ? d.totalDoc : 0);
    }).catch(function () {});
    render();
  }

  function init() {
    // Public customer review route check
    var path = window.location.pathname;
    var hash = window.location.hash || '';
    var isReview = path === '/review' || path.startsWith('/review?') || hash === '#/review' || hash.startsWith('#/review?');
    if (isReview) {
      if (global.PublicReview && typeof global.PublicReview.init === 'function') {
        global.PublicReview.init();
        return;
      }
    }

    // Icon-only buttons need their glyphs
    qs('#toggleSidebar').innerHTML = icon('sidebar');
    qs('#openSidebar').innerHTML = icon('menu');

    renderNav();
    initSidebar();
    initCmd();
    bindLogin();

    // userchip → settings
    qs('#userChip').addEventListener('click', function () { navigate('settings'); });

    // API auth failure → bounce to login
    CC.API.onAuthFail(function () {
      CC.Session.clear();
      showLogin('Your session has expired. Please sign in again.');
    });

    window.addEventListener('hashchange', render);

    // expose a tiny app API for views
    global.App = {
      navigate: navigate, render: render, setBadge: setBadge,
      logout: logout, openCmd: openCmd
    };

    if (CC.Session.token()) { showApp(); boot(); }
    else { showLogin(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
