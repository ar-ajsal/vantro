/* ============================================================================
   View: Customers — Comprehensive Customer Intelligence & CRM
   Primary key: Phone number (User Main).
   Synthesizes customer profile, delivery address history, lifetime analytics,
   and complete order history.
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, money = CC.money;

  var _all = [];
  var _term = '';
  var _filter = 'all'; // 'all', 'repeat', 'high'

  function render(root) {
    _term = '';
    _filter = 'all';

    root.innerHTML =
      '<div class="page-head">' +
      '<div>' +
      '<div class="eyebrow">CRM & Directory</div>' +
      '<h1>Customers</h1>' +
      '<div class="sub" id="custSub">Loading customer directory…</div>' +
      '</div>' +
      '<div class="head-actions">' +
      '<button class="btn" id="custRefresh">' + icon('refresh') + 'Refresh</button>' +
      '</div>' +
      '</div>' +

      // Top KPI ribbon
      '<div class="grid grid-kpi" id="custKpis" style="margin-bottom:20px">' +
      UI.skelKpis(4) +
      '</div>' +

      // Search & filter bar
      '<div class="toolbar" style="flex-wrap:wrap;gap:12px">' +
      '<div class="search-box grow">' + icon('search') +
      '<input class="input" id="custSearch" placeholder="Search by phone (main), customer name, email, or city…">' +
      '</div>' +
      '<div class="btn-group" id="custFilterGroup">' +
      '<button class="btn sm active" data-filter="all">All Customers</button>' +
      '<button class="btn sm ghost" data-filter="repeat">Repeat Buyers (2+)</button>' +
      '<button class="btn sm ghost" data-filter="high">High Value (₹500+)</button>' +
      '</div>' +
      '</div>' +

      // Customers table
      '<div class="panel">' +
      '<div class="tbl-wrap">' +
      '<table class="tbl">' +
      '<thead><tr>' +
      '<th>Customer</th>' +
      '<th>Phone Number (Main ID)</th>' +
      '<th>Email</th>' +
      '<th>Location (From Orders)</th>' +
      '<th>Orders</th>' +
      '<th>Lifetime Spend</th>' +
      '<th>Last Order</th>' +
      '<th class="no-label" style="text-align:right">Action</th>' +
      '</tr></thead>' +
      '<tbody id="custBody">' + UI.skelRows(8, 8) + '</tbody>' +
      '</table>' +
      '</div>' +
      '</div>';

    var doSearch = CC.debounce(function () {
      _term = root.querySelector('#custSearch').value.trim().toLowerCase();
      paint(root);
    }, 200);

    root.querySelector('#custSearch').addEventListener('input', doSearch);
    root.querySelector('#custRefresh').addEventListener('click', function () { load(root); });

    var filterBtns = root.querySelectorAll('#custFilterGroup button');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); b.classList.add('ghost'); });
        btn.classList.add('active');
        btn.classList.remove('ghost');
        _filter = btn.getAttribute('data-filter');
        paint(root);
      });
    });

    load(root);
  }

  function load(root) {
    CC.API.get('/customer').then(function (d) {
      _all = (d && d.customers) || [];
      paintKpis(root);
      paint(root);
    }).catch(function (e) {
      root.querySelector('#custBody').innerHTML =
        '<tr><td colspan="8" class="no-label">' + UI.errorState(e.message, 'custRetry') + '</td></tr>';
      var rt = root.querySelector('#custRetry');
      if (rt) rt.addEventListener('click', function () { load(root); });
    });
  }

  function paintKpis(root) {
    var kpisEl = root.querySelector('#custKpis');
    if (!kpisEl) return;

    var totalCustomers = _all.length;
    var repeatCustomers = _all.filter(function (c) { return (c.totalOrders || 0) >= 2; }).length;
    var totalLtv = _all.reduce(function (sum, c) { return sum + (c.totalSpent || 0); }, 0);
    var locations = new Set();
    _all.forEach(function (c) { if (c.city) locations.add(c.city); });

    kpisEl.innerHTML =
      UI.kpiCard({ label: 'Total Customers', value: CC.num(totalCustomers), sub: 'Active in database', iconName: 'users' }) +
      UI.kpiCard({ label: 'Repeat Buyers', value: CC.num(repeatCustomers), sub: (totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0) + '% retention rate', iconName: 'activity' }) +
      UI.kpiCard({ label: 'Customer Lifetime Value', value: money(totalLtv), sub: 'Gross revenue generated', iconName: 'rupee' }) +
      UI.kpiCard({ label: 'Delivery Cities', value: CC.num(locations.size || 1), sub: Array.from(locations).slice(0, 2).join(', ') || 'All India', iconName: 'map-pin' });

    if (UI.bindTilt) UI.bindTilt(kpisEl);
  }

  function paint(root) {
    var list = _all.filter(function (c) {
      // Filter tab
      if (_filter === 'repeat' && (c.totalOrders || 0) < 2) return false;
      if (_filter === 'high' && (c.totalSpent || 0) < 500) return false;

      // Text search
      if (!_term) return true;
      var haystack = [
        c.name || '',
        c.phone || '',
        c.normalizedPhone || '',
        c.email || '',
        c.city || '',
        (c.addresses || []).join(' ')
      ].join(' ').toLowerCase();

      return haystack.indexOf(_term) >= 0;
    });

    root.querySelector('#custSub').textContent =
      CC.num(list.length) + ' customer' + (list.length === 1 ? '' : 's') + ' identified by primary phone number';

    var body = root.querySelector('#custBody');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="8" class="no-label">' +
        UI.emptyState({
          icon: 'users',
          title: 'No customers found',
          body: _term ? 'No customers match your search criteria.' : 'No customer orders recorded yet.'
        }) + '</td></tr>';
      return;
    }

    body.innerHTML = list.map(function (c) {
      var initial = (c.name || '?').trim()[0].toUpperCase();
      var cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
      var isRepeat = (c.totalOrders || 0) >= 2;
      var isHigh = (c.totalSpent || 0) >= 500;
      var tagHtml = isHigh ? '<span class="badge ok" style="font-size:10px;padding:1px 6px">VIP</span>' :
                    (isRepeat ? '<span class="badge violet" style="font-size:10px;padding:1px 6px">Repeat</span>' :
                    '<span class="badge neutral" style="font-size:10px;padding:1px 6px">New</span>');

      var lastOrderDate = (c.lastOrder && c.lastOrder.date) ? CC.timeAgo(c.lastOrder.date) :
                          (c.createdAt ? CC.timeAgo(c.createdAt) : '—');
      var lastOrderId = (c.lastOrder && c.lastOrder.orderId) ? c.lastOrder.orderId : '';

      return '<tr data-id="' + esc(c._id) + '" style="cursor:pointer">' +
        // Customer Name & Tag
        '<td data-label="Customer">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
        '<div class="avatar" style="color:var(--lime);border:1px solid rgba(200,255,0,0.2)">' + esc(initial) + '</div>' +
        '<div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="cell-strong">' + esc(c.name || 'Valued Customer') + '</span>' +
        tagHtml +
        '</div>' +
        '</div>' +
        '</div>' +
        '</td>' +

        // Phone Number (User Main)
        '<td data-label="Phone">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="cell-strong mono" style="color:var(--lime);font-size:13px">' + esc(c.phone || '—') + '</span>' +
        (cleanPhone ? '<a class="cust-action-btn whatsapp" href="https://wa.me/' + cleanPhone + '" target="_blank" rel="noopener" title="Open WhatsApp" onclick="event.stopPropagation()">' + icon('zap') + '</a>' : '') +
        '</div>' +
        '</td>' +

        // Email
        '<td data-label="Email"><span class="cell-sub">' + esc(c.email || '—') + '</span></td>' +

        // Location
        '<td data-label="Location">' +
        (c.city ? '<span class="badge neutral" style="font-size:11.5px">' + icon('map-pin') + esc(c.city) + '</span>' : '<span class="cell-sub">—</span>') +
        '</td>' +

        // Total Orders
        '<td data-label="Orders">' +
        '<span class="badge ' + (isRepeat ? 'violet' : 'neutral') + '">' + c.totalOrders + ' order' + (c.totalOrders === 1 ? '' : 's') + '</span>' +
        '</td>' +

        // Total Spent (LTV)
        '<td data-label="Lifetime Spend">' +
        '<span class="cell-strong font-display" style="font-size:14px;color:var(--ink)">' + money(c.totalSpent) + '</span>' +
        '</td>' +

        // Last Order
        '<td data-label="Last Order">' +
        '<div class="cell-strong" style="font-size:12px">' + esc(lastOrderDate) + '</div>' +
        (lastOrderId ? '<div class="cell-sub mono" style="font-size:10.5px">' + esc(lastOrderId) + '</div>' : '') +
        '</td>' +

        // Action
        '<td data-label="Action" class="no-label" style="text-align:right">' +
        '<button class="btn sm ghost row-action-btn" data-id="' + esc(c._id) + '">Profile</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    body.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var id = tr.getAttribute('data-id');
        var c = _all.find(function (x) { return x._id === id; });
        openCustomer(c);
      });
    });
  }

  // ---- Open Comprehensive Customer Details Drawer -------------------------
  function openCustomer(c) {
    if (!c) return;

    var cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
    var initial = (c.name || '?').trim()[0].toUpperCase();
    var aov = c.totalOrders ? Math.round(c.totalSpent / c.totalOrders) : 0;
    var primaryAddr = c.primaryAddress || (c.addresses && c.addresses[0]) || 'No delivery address on record';

    // Other historical addresses
    var otherAddresses = (c.addresses || []).filter(function (a) { return a !== primaryAddr; });

    UI.openDrawer({
      title: c.name || 'Customer Profile',
      sub: 'Main Phone: ' + (c.phone || '—') + ' · Active since ' + CC.dateShort(c.createdAt),
      wide: true,
      actionsHtml:
        (cleanPhone ? '<a class="icon-btn" href="https://wa.me/' + cleanPhone + '" target="_blank" rel="noopener" title="WhatsApp">' + icon('zap') + '</a>' : '') +
        (c.phone ? '<a class="icon-btn" href="tel:' + esc(c.phone) + '" title="Call Customer">' + icon('phone') + '</a>' : '') +
        '<button class="icon-btn" id="drwCustCopyPhone" title="Copy Phone">' + icon('copy') + '</button>',
      bodyHtml:
        // Customer Profile Header Card
        '<div class="order-card" style="background:linear-gradient(180deg, var(--graphite), var(--charcoal));border-color:rgba(200,255,0,0.2)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">' +
        '<div style="display:flex;align-items:center;gap:16px">' +
        '<div class="cust-avatar" style="width:54px;height:54px;font-size:22px">' + esc(initial) + '</div>' +
        '<div>' +
        '<div style="font-size:18px;font-weight:700;color:var(--ink)">' + esc(c.name || 'Valued Customer') + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">' +
        '<span class="mono" style="color:var(--lime);font-weight:700;font-size:13.5px">' + icon('phone') + ' ' + esc(c.phone || '—') + '</span>' +
        (c.email ? '<span class="cell-sub">&bull; ' + esc(c.email) + '</span>' : '') +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
        (cleanPhone ? '<a class="btn sm whatsapp" href="https://wa.me/' + cleanPhone + '" target="_blank" rel="noopener">' + icon('zap') + 'WhatsApp</a>' : '') +
        (c.phone ? '<a class="btn sm ghost" href="tel:' + esc(c.phone) + '">' + icon('phone') + 'Call</a>' : '') +
        '</div>' +
        '</div>' +
        '</div>' +

        // 4 KPI Analytics Strip
        '<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:12px">' +
        '<div class="stat-tile" style="padding:14px"><div class="st-num" style="color:var(--lime)">' + money(c.totalSpent) + '</div><div class="st-lbl">Lifetime Spend</div></div>' +
        '<div class="stat-tile" style="padding:14px"><div class="st-num">' + c.totalOrders + '</div><div class="st-lbl">Total Orders</div></div>' +
        '<div class="stat-tile" style="padding:14px"><div class="st-num">' + money(aov) + '</div><div class="st-lbl">Average Order</div></div>' +
        '<div class="stat-tile" style="padding:14px"><div class="st-num" style="font-size:14px;color:var(--ink)">' + (c.totalOrders >= 2 ? 'Repeat Buyer' : 'Single Order') + '</div><div class="st-lbl">Customer Tier</div></div>' +
        '</div>' +

        // Location & Delivery Address Section
        '<div class="order-card">' +
        '<div class="order-card-head">' +
        '<div class="dsec-title-left">' + icon('map-pin') + '<span>Customer Location & Delivery Address</span></div>' +
        (c.city ? '<span class="badge neutral mono">📍 ' + esc(c.city) + (c.state ? ', ' + esc(c.state) : '') + '</span>' : '') +
        '</div>' +
        '<p class="cell-sub" style="font-size:12px;margin-bottom:10px">Address automatically gathered from customer fulfillment orders:</p>' +
        '<div class="addr-box">' +
        '<div class="addr-content">' +
        '<span class="addr-icon">' + icon('map-pin') + '</span>' +
        '<div class="addr-text">' + esc(primaryAddr) + '</div>' +
        '</div>' +
        '<div style="margin-top:10px">' +
        '<button class="btn ghost sm" id="btnCopyCustAddress">' + icon('copy') + 'Copy Address</button>' +
        '</div>' +
        '</div>' +
        (otherAddresses.length ?
          '<div style="margin-top:14px">' +
          '<div class="cell-sub" style="font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:6px">Other addresses used in past orders (' + otherAddresses.length + '):</div>' +
          otherAddresses.map(function (oa) {
            return '<div class="cell-sub" style="padding:8px 12px;background:var(--graphite-2);border-radius:var(--r-sm);margin-top:4px;font-size:12px">' +
              icon('map-pin') + ' ' + esc(oa) +
              '</div>';
          }).join('') +
          '</div>' : '') +
        '</div>' +

        // Latest Order Spotlight Card (What did they order last)
        (c.lastOrder ?
          '<div class="order-card" style="border-color:rgba(200,255,0,0.25)">' +
          '<div class="order-card-head">' +
          '<div class="dsec-title-left">' + icon('package') + '<span>Latest Order: ' + esc(c.lastOrder.orderId) + '</span></div>' +
          '<span class="badge ' + CC.orderBadgeClass(c.lastOrder.status) + '"><i class="d"></i>' + esc(c.lastOrder.status) + '</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:12px;color:var(--ink-3)">' +
          '<span>Placed: <b>' + CC.dateLong(c.lastOrder.date) + ' (' + CC.timeAgo(c.lastOrder.date) + ')</b></span>' +
          '<span class="cell-strong font-display" style="font-size:15px;color:var(--lime)">' + money(c.lastOrder.total) + '</span>' +
          '</div>' +
          '<div class="order-items-list">' +
          (c.lastOrder.items && c.lastOrder.items.length ?
            c.lastOrder.items.map(function (it) {
              return '<div class="order-item-row">' +
                (it.image ?
                  '<img class="order-item-thumb" src="' + esc(it.image) + '" alt="' + esc(it.name) + '">' :
                  '<div class="order-item-thumb thumb-ph">' + icon('box') + '</div>') +
                '<div class="order-item-info">' +
                '<div class="order-item-title">' + esc(it.name) + '</div>' +
                (it.variant ? '<div class="order-item-variant"><span class="badge neutral" style="font-size:10px">' + esc(it.variant) + '</span></div>' : '') +
                '</div>' +
                '<div class="order-item-qty">×' + it.quantity + '</div>' +
                '<div class="order-item-price">' + money(it.price * it.quantity) + '</div>' +
                '</div>';
            }).join('') : '<div class="cell-sub" style="padding:10px">Item details unavailable</div>') +
          '</div>' +
          '<div style="margin-top:14px;display:flex;justify-content:flex-end">' +
          '<button class="btn primary sm" id="btnOpenLatestOrder" data-oid="' + esc(c.lastOrder.id) + '">' +
          icon('external') + 'Open Order ' + esc(c.lastOrder.orderId) +
          '</button>' +
          '</div>' +
          '</div>' : '') +

        // Complete Order History List
        '<div class="order-card">' +
        '<div class="order-card-head">' +
        '<div class="dsec-title-left">' + icon('cart') + '<span>All Orders Placed (' + c.totalOrders + ')</span></div>' +
        '</div>' +
        '<div class="order-items-list">' +
        (c.orders && c.orders.length ?
          c.orders.map(function (o) {
            return '<div class="order-item-row" style="cursor:pointer" data-view-oid="' + esc(o.id) + '">' +
              '<div class="order-item-info">' +
              '<div style="display:flex;align-items:center;gap:8px">' +
              '<span class="cell-strong mono" style="color:var(--lime)">' + esc(o.orderId) + '</span>' +
              '<span class="badge ' + CC.orderBadgeClass(o.status) + '" style="font-size:10.5px;padding:2px 7px">' + esc(o.status) + '</span>' +
              '</div>' +
              '<div class="cell-sub" style="font-size:11.5px;margin-top:3px">' + CC.dateLong(o.date) + ' (' + CC.timeAgo(o.date) + ')</div>' +
              '</div>' +
              '<div class="order-item-price font-display" style="font-size:15px">' + money(o.total) + '</div>' +
              '<button class="btn sm ghost" style="flex-shrink:0">View &rarr;</button>' +
              '</div>';
          }).join('') : '<div class="cell-sub" style="padding:16px;text-align:center">No order records attached to this customer.</div>') +
        '</div>' +
        '</div>',
      onMount: function (drawerEl, close) {
        // Copy Phone button in header
        var btnCopyPhone = drawerEl.querySelector('#drwCustCopyPhone');
        if (btnCopyPhone && c.phone) {
          btnCopyPhone.addEventListener('click', function () {
            navigator.clipboard.writeText(c.phone);
            CC.toast('Phone number copied: ' + c.phone, 'ok');
          });
        }

        // Copy Address button
        var btnCopyAddr = drawerEl.querySelector('#btnCopyCustAddress');
        if (btnCopyAddr) {
          btnCopyAddr.addEventListener('click', function () {
            navigator.clipboard.writeText(primaryAddr);
            CC.toast('Customer delivery address copied', 'ok');
          });
        }

        // Open latest order button
        var btnLatest = drawerEl.querySelector('#btnOpenLatestOrder');
        if (btnLatest) {
          btnLatest.addEventListener('click', function () {
            var oid = btnLatest.getAttribute('data-oid');
            close();
            if (global.Views && global.Views.orders && global.Views.orders.open) {
              global.Views.orders.open(oid);
            } else if (global.App && global.App.navigate) {
              global.App.navigate('orders', { id: oid });
            }
          });
        }

        // Click on any order in history
        drawerEl.querySelectorAll('[data-view-oid]').forEach(function (row) {
          row.addEventListener('click', function () {
            var oid = row.getAttribute('data-view-oid');
            close();
            if (global.Views && global.Views.orders && global.Views.orders.open) {
              global.Views.orders.open(oid);
            } else if (global.App && global.App.navigate) {
              global.App.navigate('orders', { id: oid });
            }
          });
        });
      }
    });
  }

  global.Views.customers = {
    title: 'Customers',
    crumb: 'Customers',
    render: render,
    open: openCustomer
  };
})(window);
