/* ============================================================================
   View: Dashboard — revenue, order, inventory & customer intelligence.
   Data sources (all admin-gated, real aggregations):
     GET /orders/dashboard-amount   → today/yesterday/thisMonth/lastMonth/total
     GET /orders/dashboard-count    → totals by status
     GET /orders/dashboard-recent-order?limit=8
     GET /orders/best-seller/chart?limit=6
     GET /orders?limit=…            → recent orders for the revenue trend + activity
     GET /products?limit=100        → inventory intelligence (low/out of stock)
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, money = CC.money, moneyCompact = CC.moneyCompact, num = CC.num;

  function render(root) {
    root.innerHTML =
      '<div class="page-head">' +
      '<div><div class="eyebrow">Command Center</div><h1>Dashboard</h1>' +
      '<div class="sub">Live revenue, orders and inventory intelligence.</div></div>' +
      '<div class="head-actions">' +
      '<button class="btn" id="dashRefresh">' + icon('refresh') + 'Refresh</button>' +
      '<button class="btn primary" data-nav="orders">' + icon('cart') + 'View orders</button>' +
      '</div></div>' +
      '<div class="grid grid-kpi" id="kpiRow">' + UI.skelKpis(4) + '</div>' +
      '<div class="grid grid-2" style="margin-top:16px">' +
      '<div class="panel"><div class="panel-head"><h3>' + icon('trending-up') + 'Revenue trend</h3>' +
      '<div class="seg" id="trendSeg"><button data-days="7" class="active">7D</button><button data-days="14">14D</button><button data-days="30">30D</button></div></div>' +
      '<div class="panel-pad"><div class="chart-wrap" id="revChart">' + UI.spinner() + '</div>' +
      '<div class="legend"><span><i style="background:var(--ink)"></i>Paid revenue</span></div></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>' + icon('gauge') + 'Order status</h3></div>' +
      '<div class="panel-pad" id="statusDonut">' + UI.spinner() + '</div></div>' +
      '</div>' +
      '<div class="grid grid-2" style="margin-top:16px">' +
      '<div class="panel"><div class="panel-head"><h3>' + icon('activity') + 'Live activity</h3>' +
      '<span class="live-dot"><i></i>Real-time</span></div>' +
      '<div id="activityFeed">' + UI.spinner() + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:16px">' +
      '<div class="panel"><div class="panel-head"><h3>' + icon('star') + 'Best sellers</h3></div>' +
      '<div class="panel-pad" id="bestSellers">' + UI.spinner() + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h3>' + icon('archive') + 'Inventory watch</h3>' +
      '<button class="btn sm ghost" data-nav="products">All</button></div>' +
      '<div class="panel-pad" id="inventoryWatch">' + UI.spinner() + '</div></div>' +
      '</div></div>';

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) global.App.navigate(nav.getAttribute('data-nav'));
      if (e.target.closest('#dashRefresh')) load(root);
    });
    root.querySelector('#trendSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-days]'); if (!b) return;
      CC.qsa('#trendSeg button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      loadTrend(root, +b.getAttribute('data-days'));
    });

    load(root);
  }

  function load(root) {
    loadKpis(root);
    loadTrend(root, 7);
    loadStatus(root);
    loadActivity(root);
    loadBestSellers(root);
    loadInventory(root);
  }

  function loadKpis(root) {
    Promise.all([
      CC.API.get('/orders/dashboard-amount').catch(function () { return {}; }),
      CC.API.get('/orders/dashboard-count').catch(function () { return {}; })
    ]).then(function (res) {
      var amt = res[0] || {}, cnt = res[1] || {};
      var kpis = [
        UI.kpiCard({
          label: 'Revenue · Today', value: moneyCompact(amt.todayOrderAmount || 0),
          iconName: 'rupee', sub: 'Yesterday ' + moneyCompact(amt.yesterdayOrderAmount || 0),
          delta: { pct: CC.pct(amt.todayOrderAmount, amt.yesterdayOrderAmount) }
        }),
        UI.kpiCard({
          label: 'Revenue · This month', value: moneyCompact(amt.thisMonthOrderAmount || 0),
          iconName: 'trending-up', sub: 'Last month ' + moneyCompact(amt.lastMonthOrderAmount || 0),
          delta: { pct: CC.pct(amt.thisMonthOrderAmount, amt.lastMonthOrderAmount) }
        }),
        (function () {
          var activeSub = [];
          if (cnt.totalConfirmedOrder) activeSub.push(cnt.totalConfirmedOrder + ' confirmed');
          if (cnt.totalProcessingOrder) activeSub.push(cnt.totalProcessingOrder + ' processing');
          if (cnt.totalShippedOrder) activeSub.push(cnt.totalShippedOrder + ' shipped');
          if (cnt.totalPendingOrder) activeSub.push(cnt.totalPendingOrder + ' pending');
          if (!activeSub.length && cnt.totalDeliveredOrder) activeSub.push(cnt.totalDeliveredOrder + ' delivered');
          var subText = activeSub.length ? activeSub.slice(0, 2).join(' · ') : (cnt.totalOrder ? cnt.totalOrder + ' recorded' : 'No orders yet');

          return UI.kpiCard({
            label: 'Total orders', value: num(cnt.totalOrder || 0),
            iconName: 'cart', sub: subText
          });
        })(),
        UI.kpiCard({
          label: 'Lifetime revenue', value: moneyCompact(amt.totalOrderAmount || 0),
          iconName: 'wallet', sub: (cnt.totalDeliveredOrder || 0) + ' delivered'
        })
      ];
      root.querySelector('#kpiRow').innerHTML = kpis.join('');
      UI.bindTilt(root);
    });
  }

  // Build a per-day revenue series from recent Paid orders (client-side bucket).
  function loadTrend(root, days) {
    var box = root.querySelector('#revChart');
    box.innerHTML = UI.spinner();
    // pull a generous window of recent orders and bucket by day
    CC.API.get('/orders?limit=300').then(function (d) {
      var orders = (d && d.orders) || [];
      var buckets = {};
      var labels = [];
      for (var i = days - 1; i >= 0; i--) {
        var dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - i);
        var key = dt.toISOString().slice(0, 10);
        buckets[key] = 0;
        labels.push({ key: key, label: dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) });
      }
      orders.forEach(function (o) {
        if ((o.paymentStatus || '') !== 'Paid') return;
        var key = new Date(o.createdAt).toISOString().slice(0, 10);
        if (key in buckets) buckets[key] += (o.total || 0);
      });
      var series = labels.map(function (l) { return { label: l.label, value: buckets[l.key] }; });
      var total = series.reduce(function (a, s) { return a + s.value; }, 0);
      if (total === 0) { box.innerHTML = UI.emptyState({ icon: 'trending-up', title: 'No paid revenue yet', body: 'Revenue will chart here once orders are paid.' }); return; }
      box.innerHTML = UI.areaChart(series, { height: 230 });
    }).catch(function (e) { box.innerHTML = UI.errorState(e.message); });
  }

  function loadStatus(root) {
    var box = root.querySelector('#statusDonut');
    CC.API.get('/orders/dashboard-count').then(function (c) {
      c = c || {};
      var total = Number(c.totalOrder) || 0;
      if (total === 0) {
        box.innerHTML = UI.emptyState({ icon: 'gauge', title: 'No orders yet' });
        return;
      }

      var byStatus = c.byStatus || {};

      // If backend returned legacy payload without byStatus or without Confirmed
      if (!c.byStatus) {
        byStatus['Delivered'] = c.totalDeliveredOrder || 0;
        byStatus['Processing'] = c.totalProcessingOrder || 0;
        byStatus['Pending'] = c.totalPendingOrder || 0;
        if (c.totalConfirmedOrder) byStatus['Confirmed'] = c.totalConfirmedOrder;
        if (c.totalShippedOrder) byStatus['Shipped'] = c.totalShippedOrder;
        if (c.totalCancelledOrder) byStatus['Cancelled'] = c.totalCancelledOrder;

        var knownSum = (byStatus['Delivered'] || 0) + (byStatus['Processing'] || 0) +
                       (byStatus['Pending'] || 0) + (byStatus['Confirmed'] || 0) +
                       (byStatus['Shipped'] || 0) + (byStatus['Cancelled'] || 0);
        var rem = Math.max(0, total - knownSum);
        // In Vantro, new storefront orders are automatically Confirmed on payment
        if (rem > 0 && !byStatus['Confirmed']) {
          byStatus['Confirmed'] = rem;
        } else if (rem > 0) {
          byStatus['Other'] = rem;
        }
      }

      // Recognized order statuses in standard commerce lifecycle
      var statusConfig = [
        { key: 'Confirmed', label: 'Confirmed', color: '#18181b' },
        { key: 'Processing', label: 'Processing', color: '#52525b' },
        { key: 'Shipped', label: 'Shipped', color: '#71717a' },
        { key: 'Out For Delivery', label: 'Out for delivery', color: '#a1a1aa' },
        { key: 'Delivered', label: 'Delivered', color: '#059669' },
        { key: 'Pending', label: 'Pending', color: '#d97706' },
        { key: 'Cancelled', label: 'Cancelled', color: '#dc2626' },
        { key: 'Returned', label: 'Returned', color: '#e11d48' }
      ];

      var segs = [];
      var accounted = 0;

      statusConfig.forEach(function (cfg) {
        var count = Number(byStatus[cfg.key]) || 0;
        if (count > 0) {
          segs.push({ label: cfg.label, value: count, color: cfg.color });
          accounted += count;
        }
      });

      // Include any other custom/unmapped status with a positive count
      Object.keys(byStatus).forEach(function (k) {
        var isKnown = statusConfig.some(function (cfg) { return cfg.key.toLowerCase() === k.toLowerCase(); });
        if (!isKnown && byStatus[k] > 0) {
          segs.push({ label: k, value: byStatus[k], color: '#9ca3af' });
          accounted += byStatus[k];
        }
      });

      var uncounted = Math.max(0, total - accounted);
      if (uncounted > 0) {
        segs.push({ label: 'Other', value: uncounted, color: '#9ca3af' });
      }

      // Fallback if segs is somehow empty despite total > 0
      if (!segs.length && total > 0) {
        segs.push({ label: 'Confirmed', value: total, color: '#18181b' });
      }

      box.innerHTML =
        UI.donut(segs, { centerLabel: 'orders', centerValue: num(total) }) +
        '<div class="legend" style="justify-content:center;margin-top:16px;display:flex;flex-wrap:wrap;gap:8px 14px">' +
        segs.map(function (s) {
          return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--ink-2)">' +
            '<i style="width:8px;height:8px;border-radius:2px;background:' + s.color + ';display:inline-block"></i>' +
            esc(s.label) + ' &bull; <b>' + num(s.value) + '</b></span>';
        }).join('') +
        '</div>';
    }).catch(function (e) { box.innerHTML = UI.errorState(e.message); });
  }

  function loadActivity(root) {
    var box = root.querySelector('#activityFeed');
    CC.API.get('/orders/dashboard-recent-order?limit=8').then(function (d) {
      var orders = (d && d.orders) || [];
      if (!orders.length) { box.innerHTML = UI.emptyState({ icon: 'activity', title: 'No recent activity' }); return; }
      box.innerHTML = '<div class="activity">' + orders.map(function (o) {
        var badge = CC.orderBadgeClass(o.status);
        return '<div class="act-item">' +
          '<div class="act-ic">' + icon('cart') + '</div>' +
          '<div class="act-body">' +
          '<div class="act-title"><b>' + esc(o.customerName || 'Customer') + '</b> placed ' +
          '<b>' + esc(o.orderId || '') + '</b></div>' +
          '<div class="act-meta">' + CC.timeAgo(o.createdAt) + ' · <span class="badge ' + badge + '" style="padding:1px 7px">' + esc(o.status || '') + '</span></div>' +
          '</div>' +
          '<div class="act-amt">' + money(o.total || 0) + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }).catch(function (e) { box.innerHTML = UI.errorState(e.message); });
  }

  function loadBestSellers(root) {
    var box = root.querySelector('#bestSellers');
    CC.API.get('/orders/best-seller/chart?limit=6').then(function (d) {
      var rows = ((d && d.bestSellingProduct) || []).map(function (p) {
        return { label: CC.locName(p.name, 'Product'), value: p.total || 0 };
      });
      box.innerHTML = UI.barList(rows, { fmt: function (v) { return num(v) + ' sold'; } });
    }).catch(function (e) { box.innerHTML = UI.errorState(e.message); });
  }

  function loadInventory(root) {
    var box = root.querySelector('#inventoryWatch');
    CC.API.get('/products?limit=100').then(function (d) {
      var products = (d && d.products) || [];
      var flagged = products.filter(function (p) { return (p.stock || 0) <= 5; })
        .sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); })
        .slice(0, 6);
      if (!flagged.length) {
        box.innerHTML = UI.emptyState({ icon: 'check-circle', title: 'Inventory healthy', body: 'No products at or below 5 units.' });
        return;
      }
      box.innerHTML = flagged.map(function (p) {
        var stock = p.stock || 0;
        var tone = stock === 0 ? 'bad' : 'warn';
        var label = stock === 0 ? 'Out of stock' : stock + ' left';
        return '<div class="li-item" style="cursor:pointer" data-pid="' + esc(p._id) + '">' +
          '<div class="thumb thumb-ph">' + (p.image && p.image[0] ?
            '<img class="thumb" src="' + esc(p.image[0]) + '" alt="">' : icon('box')) + '</div>' +
          '<div class="li-name">' + esc(CC.locName(p.title, 'Product')) + '</div>' +
          '<span class="badge ' + tone + '">' + esc(label) + '</span>' +
          '</div>';
      }).join('');
      box.querySelectorAll('[data-pid]').forEach(function (r) {
        r.addEventListener('click', function () { global.App.navigate('products', { id: r.getAttribute('data-pid') }); });
      });
    }).catch(function (e) { box.innerHTML = UI.errorState(e.message); });
  }

  global.Views.dashboard = { title: 'Dashboard', crumb: 'Dashboard', render: render };
})(window);
