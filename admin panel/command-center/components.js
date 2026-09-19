/* ============================================================================
   Chromvault Command Center — reusable UI components
   Buildless SVG charts (sparkline, area, donut), a right-side drawer, KPI/
   stat/table/skeleton builders. Everything returns HTML strings or mounts into
   a container; no framework, no CDN.
   ========================================================================== */
(function (global) {
  'use strict';

  var CC = global.CC;
  var esc = CC.esc, el = CC.el, icon = global.icon;

  // ---- Skeletons ------------------------------------------------------------
  function skel(w, h, cls) {
    return '<div class="skeleton ' + (cls || '') + '" style="width:' + w + ';height:' + (h || '14px') + '"></div>';
  }
  function skelKpis(n) {
    var out = '';
    for (var i = 0; i < (n || 4); i++) {
      out += '<div class="kpi">' +
        '<div class="kpi-top">' + skel('34px', '34px', '') + skel('54px', '18px') + '</div>' +
        '<div style="margin-top:16px">' + skel('60%', '30px') + '</div>' +
        '<div style="margin-top:12px">' + skel('45%', '12px') + '</div></div>';
    }
    return out;
  }
  function skelRows(cols, rows) {
    var out = '';
    for (var r = 0; r < (rows || 6); r++) {
      out += '<tr>';
      for (var c = 0; c < cols; c++) out += '<td>' + skel((40 + Math.random() * 45) + '%') + '</td>';
      out += '</tr>';
    }
    return out;
  }

  // ---- Empty / error states -------------------------------------------------
  function emptyState(opts) {
    opts = opts || {};
    return '<div class="center-state">' +
      icon(opts.icon || 'inbox') +
      '<h4>' + esc(opts.title || 'Nothing here yet') + '</h4>' +
      (opts.body ? '<p>' + esc(opts.body) + '</p>' : '') +
      (opts.actionLabel ? '<button class="btn primary" id="' + (opts.actionId || 'emptyAction') + '">' +
        icon('plus') + esc(opts.actionLabel) + '</button>' : '') +
      '</div>';
  }
  function errorState(msg, retryId) {
    return '<div class="center-state">' + icon('alert') +
      '<h4>Something went wrong</h4><p>' + esc(msg || 'Failed to load data.') + '</p>' +
      '<button class="btn" id="' + (retryId || 'retryBtn') + '">' + icon('refresh') + 'Retry</button></div>';
  }
  function spinner() { return '<div class="center-state"><div class="spinner"></div></div>'; }

  // ---- KPI card -------------------------------------------------------------
  // Accepts { label/title, value/val, sub, iconName/ic, delta:{pct, dir} }
  function kpiCard(k) {
    if (!k) return '';
    var deltaHtml = '';
    if (k.delta && isFinite(k.delta.pct)) {
      var dir = k.delta.dir || (k.delta.pct > 0 ? 'up' : k.delta.pct < 0 ? 'down' : 'flat');
      var arrow = dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'arrow-right';
      deltaHtml = '<span class="delta ' + dir + '">' + icon(arrow) +
        Math.abs(k.delta.pct).toFixed(1) + '%</span>';
    }
    var lbl = k.label || k.title || '';
    var val = (k.value !== undefined && k.value !== null) ? k.value : ((k.val !== undefined && k.val !== null) ? k.val : '—');
    var ic = k.iconName || k.ic || 'activity';

    return '<div class="kpi" data-tilt>' +
      '<div class="kpi-top">' +
      '<div class="kpi-ic">' + icon(ic) + '</div>' +
      deltaHtml +
      '</div>' +
      '<div class="kpi-label">' + esc(lbl) + '</div>' +
      '<div class="kpi-val">' + val + '</div>' +
      (k.sub ? '<div class="kpi-foot">' + esc(k.sub) + '</div>' : '') +
      '</div>';
  }

  // Magnetic tilt + spotlight for KPI cards
  function bindTilt(root) {
    CC.qsa('[data-tilt]', root).forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  function statTile(t) {
    var tone = t.tone || 'lime';
    var bg = {
      lime: 'var(--lime-glow)', ok: 'var(--ok-bg)', warn: 'var(--warn-bg)',
      info: 'var(--info-bg)', bad: 'var(--bad-bg)', violet: 'var(--violet-bg)'
    }[tone] || 'var(--graphite-2)';
    var fg = {
      lime: 'var(--lime)', ok: 'var(--ok)', warn: 'var(--warn)',
      info: 'var(--info)', bad: 'var(--bad)', violet: 'var(--violet)'
    }[tone] || 'var(--ink-2)';
    return '<div class="stat-tile">' +
      '<div class="st-ic" style="background:' + bg + ';color:' + fg + '">' + icon(t.iconName || 'box') + '</div>' +
      '<div><div class="st-val">' + t.value + '</div><div class="st-lbl">' + esc(t.label) + '</div></div>' +
      '</div>';
  }

  // ---- SVG charts -----------------------------------------------------------
  // Smooth area/line chart. data = [{label, value}], returns <svg> string.
  function areaChart(data, opts) {
    opts = opts || {};
    var w = opts.width || 720, h = opts.height || 220;
    var padL = 8, padR = 8, padT = 16, padB = 26;
    if (!data || !data.length) return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '"></svg>';
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    max = max <= 0 ? 1 : max * 1.15;
    var iw = w - padL - padR, ih = h - padT - padB;
    var n = data.length;
    var xs = function (i) { return padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
    var ys = function (v) { return padT + ih - (v / max) * ih; };

    // Catmull-Rom → bezier for smooth curve
    var pts = data.map(function (d, i) { return [xs(i), ys(d.value)]; });
    var path = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    var area = path + ' L' + pts[pts.length - 1][0] + ',' + (padT + ih) + ' L' + pts[0][0] + ',' + (padT + ih) + ' Z';

    var gid = 'ag' + Math.random().toString(36).slice(2, 8);
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (ih / 3) * g;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy +
        '" stroke="var(--line-soft)" stroke-width="1"/>';
    }
    var labels = '';
    var step = Math.ceil(n / 7);
    data.forEach(function (d, i) {
      if (i % step === 0 || i === n - 1) {
        labels += '<text x="' + xs(i) + '" y="' + (h - 8) + '" font-size="9.5" text-anchor="middle">' +
          esc(d.label) + '</text>';
      }
    });
    var dots = pts.map(function (p) {
      return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.5" fill="var(--lime)"/>';
    }).join('');

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--lime)" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="var(--lime)" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + path + '" fill="none" stroke="var(--lime)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + labels +
      '</svg>';
  }

  // Donut chart. segments = [{label, value, color}]
  function donut(segments, opts) {
    opts = opts || {};
    var size = opts.size || 168, stroke = opts.stroke || 22;
    var r = (size - stroke) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
    var total = segments.reduce(function (a, s) { return a + s.value; }, 0) || 1;
    var off = 0;
    var arcs = segments.map(function (s) {
      var frac = s.value / total, len = frac * circ;
      var seg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color +
        '" stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + (circ - len) +
        '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"/>';
      off += len;
      return seg;
    }).join('');
    var center = opts.centerLabel ?
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)" font-family="var(--font-display)">' +
      esc(opts.centerValue || '') + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" font-size="10">' + esc(opts.centerLabel) + '</text>' : '';
    return '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" style="max-width:' + size + 'px;margin:0 auto;">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--graphite-2)" stroke-width="' + stroke + '"/>' +
      arcs + center + '</svg>';
  }

  // Horizontal bars. rows = [{label, value}], values scaled to max.
  function barList(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return emptyState({ icon: 'chart', title: 'No data yet' });
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    return '<div class="bars">' + rows.map(function (r) {
      var pctW = Math.round((r.value / max) * 100);
      return '<div class="bar-row">' +
        '<span class="bar-label">' + esc(r.label) + '</span>' +
        '<span class="bar-val">' + (opts.fmt ? opts.fmt(r.value) : CC.num(r.value)) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pctW + '%"></div></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  // ---- Drawer ---------------------------------------------------------------
  // opts: { title, sub, bodyHtml, footHtml, wide, onMount(rootEl) }
  var _drawerKeyHandler = null;
  function openDrawer(opts) {
    var scrim = CC.qs('#drawerScrim');
    var existing = CC.qs('.drawer'); if (existing) existing.remove();
    var d = el('div', { class: 'drawer' + (opts.wide ? ' wide' : '') });
    d.innerHTML =
      '<div class="drawer-head">' +
      '<div><h2>' + esc(opts.title || '') + '</h2>' +
      (opts.sub ? '<div class="sub">' + esc(opts.sub) + '</div>' : '') + '</div>' +
      '<div class="drawer-head-actions">' +
      (opts.actionsHtml || '') +
      '<button class="icon-btn" data-drawer-close aria-label="Close">' + icon('x') + '</button>' +
      '</div></div>' +
      '<div class="drawer-body" id="drawerBody">' + (opts.bodyHtml || '') + '</div>' +
      (opts.footHtml ? '<div class="drawer-foot">' + opts.footHtml + '</div>' : '');
    document.body.appendChild(d);
    requestAnimationFrame(function () { scrim.classList.add('open'); d.classList.add('open'); });

    function close() {
      scrim.classList.remove('open'); d.classList.remove('open');
      if (_drawerKeyHandler) { document.removeEventListener('keydown', _drawerKeyHandler); _drawerKeyHandler = null; }
      setTimeout(function () { d.remove(); }, 340);
    }
    d.addEventListener('click', function (e) { if (e.target.closest('[data-drawer-close]')) close(); });
    scrim.onclick = close;
    _drawerKeyHandler = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', _drawerKeyHandler);

    if (opts.onMount) opts.onMount(d, close);
    return { el: d, close: close };
  }

  // ---- Pager ----------------------------------------------------------------
  function pager(page, pages, totalDoc, limit) {
    var from = totalDoc === 0 ? 0 : (page - 1) * limit + 1;
    var to = Math.min(page * limit, totalDoc);
    return '<div class="pager">' +
      '<div class="info">Showing <b>' + from + '</b>–<b>' + to + '</b> of <b>' + CC.num(totalDoc) + '</b></div>' +
      '<div class="ctrls">' +
      '<button class="btn sm" data-page="prev"' + (page <= 1 ? ' disabled' : '') + '>' + icon('chevron-left') + 'Prev</button>' +
      '<button class="btn sm" data-page="next"' + (page >= pages ? ' disabled' : '') + '>Next' + icon('chevron-right') + '</button>' +
      '</div></div>';
  }

  global.UI = {
    skel: skel, skelKpis: skelKpis, skelRows: skelRows,
    emptyState: emptyState, errorState: errorState, spinner: spinner,
    kpiCard: kpiCard, bindTilt: bindTilt, statTile: statTile,
    areaChart: areaChart, donut: donut, barList: barList,
    openDrawer: openDrawer, pager: pager
  };
})(window);
