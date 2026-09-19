/* ============================================================================
   View: Orders — list, filters, search, and an ultra-premium order details
   experience (both slide-over drawer and full-page view).
   API:
     GET  /orders?search=&status=&paymentStatus=&page=&limit=
     GET  /orders/:id
     PUT  /orders/:id   { status | paymentStatus | shippingDetails }
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, money = CC.money;

  var q = { search: '', status: '', paymentStatus: '', page: 1, limit: 12 };

  // ---- Safe Data Normalizer -------------------------------------------------
  function normalizeOrder(o) {
    if (!o) return null;
    var u = o.userInfo || {};
    var addr = o.deliveryAddress || {};
    var pd = o.paymentDetails || {};
    var sd = o.shippingDetails || {};

    var customerName = o.customerName || u.name || 'Valued Customer';
    var phone = o.phone || u.contact || u.phone || '';
    var email = o.email || u.email || '';

    var street = addr.street || addr.address || u.address || '';
    var city = addr.city || u.city || '';
    var state = addr.state || u.state || '';
    var zip = addr.zip || addr.zipCode || u.zipCode || u.zip || '';
    var country = addr.country || u.country || 'India';

    var orderNumber = o.orderId || (o.invoice ? ('#' + o.invoice) : ('ORD-' + (o._id ? o._id.slice(-6).toUpperCase() : '')));
    var paymentRef = o.paymentReference || pd.razorpay_payment_id || pd.paymentId || '';
    var paymentDate = o.paymentDate || pd.paidAt || o.createdAt;

    var items = (o.cart || []).map(function (it) {
      return {
        id: it.id || it._id || it.productId || '',
        name: it.title || it.name || 'Jewelry Piece',
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        image: it.image || (it.images && it.images[0]) || '',
        variant: it.variant || ''
      };
    });

    return {
      raw: o,
      _id: o._id,
      orderNumber: orderNumber,
      invoice: o.invoice || orderNumber,
      customerName: customerName,
      phone: phone,
      email: email,
      address: { street: street, city: city, state: state, zip: zip, country: country },
      status: o.status || 'Pending',
      paymentStatus: o.paymentStatus || 'Pending',
      paymentMethod: o.paymentMethod || pd.method || 'Razorpay',
      paymentRef: paymentRef,
      paymentDate: paymentDate,
      createdAt: o.createdAt,
      shippingDate: o.shippingDate,
      deliveryDate: o.deliveryDate,
      subTotal: Number(o.subTotal || 0),
      discount: Number(o.discount || 0),
      shippingFee: Number(o.shippingFee || o.shippingCost || 0),
      total: Number(o.total || 0),
      items: items,
      shippingDetails: {
        courierName: sd.courierName || o.shippingOption || '',
        awb: sd.awb || '',
        trackingUrl: sd.trackingUrl || '',
        status: sd.status || ''
      }
    };
  }

  // ---- Main View Router -----------------------------------------------------
  function render(root, params) {
    if (params && params.id) {
      renderFullPageOrder(root, params.id);
      return;
    }

    // Orders Table View
    q = { search: '', status: (params && params.status) || '', paymentStatus: (params && params.paymentStatus) || '', page: 1, limit: 12 };

    root.innerHTML =
      '<div class="page-head">' +
      '<div><div class="eyebrow">Fulfilment</div><h1>Orders</h1>' +
      '<div class="sub" id="ordSub">Loading orders…</div></div>' +
      '<div class="head-actions">' +
      '<button class="btn" id="ordRefresh">' + icon('refresh') + 'Refresh</button>' +
      '</div></div>' +
      '<div class="toolbar">' +
      '<div class="search-box grow">' + icon('search') +
      '<input class="input" id="ordSearch" placeholder="Search order number, customer, or phone…" value="' + esc(q.search) + '">' +
      '</div>' +
      '<select class="select" id="ordStatus"><option value="">All statuses</option>' +
      CC.ORDER_STATUS.map(function (s) { return '<option' + (s === q.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select>' +
      '<select class="select" id="ordPay"><option value="">All payments</option>' +
      ['Pending', 'Paid', 'Failed'].map(function (s) { return '<option' + (s === q.paymentStatus ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select>' +
      '</div>' +
      '<div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th>Actions</th>' +
      '</tr></thead><tbody id="ordBody">' + UI.skelRows(8, 8) + '</tbody></table></div>' +
      '<div class="panel-pad" id="ordPager"></div></div>';

    var doSearch = CC.debounce(function () {
      q.search = root.querySelector('#ordSearch').value.trim();
      q.page = 1;
      load(root);
    }, 300);

    root.querySelector('#ordSearch').addEventListener('input', doSearch);
    root.querySelector('#ordStatus').addEventListener('change', function () { q.status = this.value; q.page = 1; load(root); });
    root.querySelector('#ordPay').addEventListener('change', function () { q.paymentStatus = this.value; q.page = 1; load(root); });
    root.querySelector('#ordRefresh').addEventListener('click', function () { load(root); });

    load(root);
  }

  function load(root) {
    var body = root.querySelector('#ordBody');
    body.innerHTML = UI.skelRows(8, 8);
    var path = '/orders?page=' + q.page + '&limit=' + q.limit +
      (q.search ? '&search=' + encodeURIComponent(q.search) : '') +
      (q.status ? '&status=' + encodeURIComponent(q.status) : '') +
      (q.paymentStatus ? '&paymentStatus=' + encodeURIComponent(q.paymentStatus) : '');

    CC.API.get(path).then(function (d) {
      var orders = (d && d.orders) || [];
      var totalDoc = d.totalDoc || 0, pages = d.pages || 1;
      root.querySelector('#ordSub').textContent = CC.num(totalDoc) + ' order' + (totalDoc === 1 ? '' : 's') + ' recorded';
      if (!orders.length) {
        body.innerHTML = '<tr><td colspan="8" class="no-label">' +
          UI.emptyState({ icon: 'cart', title: 'No orders found', body: 'Try clearing search or filters to see more results.' }) + '</td></tr>';
        root.querySelector('#ordPager').innerHTML = '';
        return;
      }

      body.innerHTML = orders.map(rowHtml).join('');
      root.querySelector('#ordPager').innerHTML = UI.pager(q.page, pages, totalDoc, q.limit);

      body.querySelectorAll('tr[data-id]').forEach(function (tr) {
        tr.addEventListener('click', function (e) {
          if (e.target.closest('.row-action-btn')) return;
          openOrder(tr.getAttribute('data-id'));
        });
      });

      body.querySelectorAll('.btn-view-order').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          openOrder(btn.getAttribute('data-id'));
        });
      });

      root.querySelector('#ordPager').querySelectorAll('[data-page]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('data-page') === 'next') q.page++; else q.page--;
          load(root);
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<tr><td colspan="8" class="no-label">' + UI.errorState(e.message, 'ordRetry') + '</td></tr>';
      var rt = root.querySelector('#ordRetry'); if (rt) rt.addEventListener('click', function () { load(root); });
    });
  }

  function rowHtml(raw) {
    var o = normalizeOrder(raw);
    var itemCount = o.items.reduce(function (a, i) { return a + i.quantity; }, 0);
    var payBadge = o.paymentStatus === 'Paid' ? 'ok' : o.paymentStatus === 'Failed' ? 'bad' : 'warn';

    return '<tr data-id="' + esc(o._id) + '" style="cursor:pointer">' +
      '<td data-label="Order"><div class="cell-strong mono" style="color:var(--lime)">' + esc(o.orderNumber) + '</div></td>' +
      '<td data-label="Customer"><div class="cell-strong">' + esc(o.customerName) + '</div>' +
      (o.phone ? '<div class="cell-sub mono" style="font-size:11.5px">' + esc(o.phone) + '</div>' : '') + '</td>' +
      '<td data-label="Items">' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + '</td>' +
      '<td data-label="Total"><span class="cell-strong font-display" style="font-size:15px">' + money(o.total) + '</span></td>' +
      '<td data-label="Payment"><span class="badge ' + payBadge + '"><i class="d"></i>' + esc(o.paymentStatus) + '</span></td>' +
      '<td data-label="Status"><span class="badge ' + CC.orderBadgeClass(o.status) + '">' + esc(o.status) + '</span></td>' +
      '<td data-label="Placed"><span class="cell-sub" style="font-size:12px">' + CC.timeAgo(o.createdAt) + '</span></td>' +
      '<td data-label="Actions" class="no-label"><button class="btn sm ghost btn-view-order row-action-btn" data-id="' + esc(o._id) + '">View</button></td>' +
      '</tr>';
  }

  // ---- Stepper HTML Builder -------------------------------------------------
  function buildStepperHtml(o) {
    var flow = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out For Delivery', 'Delivered'];
    var isCancelled = o.status === 'Cancelled' || o.status === 'Returned';
    var curIdx = flow.indexOf(o.status);
    if (curIdx === -1 && !isCancelled) curIdx = 0;

    var progressPct = isCancelled ? 0 : Math.min(100, Math.max(0, (curIdx / (flow.length - 1)) * 100));

    var nodes = flow.map(function (step, idx) {
      var stateCls = '';
      var timeStr = '';
      if (isCancelled) {
        stateCls = '';
      } else if (idx < curIdx) {
        stateCls = 'done';
      } else if (idx === curIdx) {
        stateCls = 'active';
      }

      if (step === 'Pending' && o.createdAt) timeStr = CC.dateShort(o.createdAt);
      else if (step === 'Shipped' && o.shippingDate) timeStr = CC.dateShort(o.shippingDate);
      else if (step === 'Delivered' && o.deliveryDate) timeStr = CC.dateShort(o.deliveryDate);

      return '<div class="step-node ' + stateCls + '">' +
        '<div class="step-dot">' + (stateCls === 'done' ? icon('check') : (idx + 1)) + '</div>' +
        '<div class="step-label">' + esc(step) + '</div>' +
        (timeStr ? '<div class="step-time">' + esc(timeStr) + '</div>' : '') +
        '</div>';
    }).join('');

    if (isCancelled) {
      nodes += '<div class="step-node cancelled">' +
        '<div class="step-dot">' + icon('x') + '</div>' +
        '<div class="step-label">' + esc(o.status) + '</div>' +
        '</div>';
    }

    return '<div class="order-stepper">' +
      '<div class="stepper-progress" style="width:calc(' + progressPct + '% - 60px);max-width:calc(100% - 60px)"></div>' +
      nodes +
      '</div>';
  }

  // ---- Order Details Interior HTML ------------------------------------------
  function buildOrderDetailsHtml(o, isFullPage) {
    var payBadge = o.paymentStatus === 'Paid' ? 'ok' : o.paymentStatus === 'Failed' ? 'bad' : 'warn';
    var cleanPhone = (o.phone || '').replace(/[^0-9]/g, '');
    var addrLines = [o.address.street, o.address.city, o.address.state, o.address.zip, o.address.country].filter(Boolean);
    var formattedAddress = addrLines.join(', ') || 'No shipping address provided';

    var heroHtml = isFullPage ? (
      '<div class="order-hero-card">' +
      '<div class="order-hero-top">' +
      '<div>' +
      '<div class="order-hero-id">' +
      icon('package') +
      '<span>' + esc(o.orderNumber) + '</span>' +
      '<button class="icon-btn sm" id="btnCopyOrderId" title="Copy Order ID">' + icon('copy') + '</button>' +
      '</div>' +
      '<div class="order-hero-badges">' +
      '<span class="badge ' + CC.orderBadgeClass(o.status) + '" style="font-size:12px;padding:4px 10px"><i class="d"></i>' + esc(o.status) + '</span>' +
      '<span class="badge ' + payBadge + '" style="font-size:12px;padding:4px 10px"><i class="d"></i>' + esc(o.paymentMethod) + ' · ' + esc(o.paymentStatus) + '</span>' +
      (o.paymentDate ? '<span class="badge neutral">' + esc(CC.dateShort(o.paymentDate)) + '</span>' : '') +
      '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn sm primary" id="btnPrintOrderSlip" title="Print Courier Package Label / Order Slip">' + icon('tag') + 'Print Order Slip</button>' +
      '<button class="icon-btn sm" id="btnPreviewOrderSlip" title="Preview Order Slip">' + icon('eye') + '</button>' +
      '<button class="btn sm ghost" id="btnPrintInvoice" title="Print Customer Invoice">' + icon('printer') + 'Print Invoice</button>' +
      '<button class="icon-btn sm" id="btnPreviewInvoice" title="Preview Customer Invoice">' + icon('eye') + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="order-hero-meta">' +
      '<span>' + icon('clock') + 'Placed on ' + esc(CC.dateLong(o.createdAt)) + ' (' + CC.timeAgo(o.createdAt) + ')</span>' +
      (o.paymentRef ? '<span>' + icon('credit-card') + 'Ref: <code class="mono" id="txtPayRef">' + esc(o.paymentRef) + '</code></span>' : '') +
      '</div>' +
      '</div>'
    ) : '';

    return heroHtml +
      // Fulfillment Stepper
      '<div class="order-card">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('activity') + '<span>Fulfillment Progress</span></div>' +
      '<span class="badge ' + CC.orderBadgeClass(o.status) + '">' + esc(o.status) + '</span>' +
      '</div>' +
      buildStepperHtml(o) +
      '</div>' +

      // 2-Column Responsive Content
      '<div class="' + (isFullPage ? 'order-page-columns' : 'grid grid-2') + '">' +
      // Column Left
      '<div style="display:flex;flex-direction:column;gap:20px">' +
      // Ordered Items Card
      '<div class="order-card">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('box') + '<span>Ordered Items (' + o.items.length + ')</span></div>' +
      '<span class="cell-sub">' + o.items.reduce(function (a, i) { return a + i.quantity; }, 0) + ' total units</span>' +
      '</div>' +
      '<div class="order-items-list">' +
      (o.items.length ? o.items.map(function (it) {
        return '<div class="order-item-row">' +
          (it.image ?
            '<img class="order-item-thumb" src="' + esc(it.image) + '" alt="' + esc(it.name) + '" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' viewBox=\\\'0 0 24 24\\\' fill=\\\'none\\\' stroke=\\\'%23464d59\\\' stroke-width=\\\'2\\\'><rect width=\\\'18\\\' height=\\\'18\\\' x=\\\'3\\\' y=\\\'3\\\' rx=\\\'2\\\'/></svg>\'">' :
            '<div class="order-item-thumb thumb-ph">' + icon('box') + '</div>') +
          '<div class="order-item-info">' +
          '<div class="order-item-title">' + esc(it.name) + '</div>' +
          (it.variant ? (function() {
            // Parse "Key: Value, Key2: Value2" into labeled rows. Fall back
            // to a plain badge if the string doesn't match the pattern.
            var pairs = it.variant.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
            var hasKeyVal = pairs.some(function(s) { return s.indexOf(':') > 0; });
            if (hasKeyVal) {
              return '<div class="order-item-variant" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">' +
                pairs.map(function(s) {
                  var idx = s.indexOf(':');
                  if (idx > 0) {
                    var k = s.slice(0, idx).trim();
                    var v = s.slice(idx + 1).trim();
                    return '<span style="font-size:11px;background:var(--paper-sink);border:1px solid var(--ink-hair);border-radius:6px;padding:2px 8px">' +
                      '<span style="color:var(--ink-3)">' + esc(k) + ':</span> <strong>' + esc(v) + '</strong>' +
                    '</span>';
                  }
                  return '<span class="badge neutral" style="font-size:10px">' + esc(s) + '</span>';
                }).join('') +
              '</div>';
            }
            return '<div class="order-item-variant"><span class="badge neutral" style="font-size:10px">' + esc(it.variant) + '</span></div>';
          })() : '') +
          '<div class="cell-sub" style="font-size:12px;margin-top:2px">' + money(it.price) + ' each</div>' +
          '</div>' +
          '<div class="order-item-qty">×' + it.quantity + '</div>' +
          '<div class="order-item-price">' + money(it.price * it.quantity) + '</div>' +
          '<div style="margin-left:16px"><button class="btn sm ghost btn-request-review" data-product-id="' + esc(it.id) + '">' + icon('star') + 'Request Review</button></div>' +
          '</div>';
      }).join('') : '<div class="cell-sub" style="padding:14px;text-align:center">No line items attached to this order.</div>') +
      '</div>' +
      '</div>' +

      // Logistics & Tracking Editor
      '<div class="order-card">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('truck') + '<span>Logistics & Shipment Tracking</span></div>' +
      (o.shippingDetails.awb ? '<span class="badge neutral mono">AWB: ' + esc(o.shippingDetails.awb) + '</span>' : '') +
      '</div>' +
      '<div class="tracking-fields-grid">' +
      '<div class="field"><label>Courier Carrier</label>' +
      '<input class="input" id="tkCourier" value="' + esc(o.shippingDetails.courierName) + '" placeholder="e.g. Delhivery, Bluedart, Shiprocket"></div>' +
      '<div class="field"><label>AWB / Tracking Number</label>' +
      '<input class="input mono" id="tkAwb" value="' + esc(o.shippingDetails.awb) + '" placeholder="Air Waybill code"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Live Tracking URL</label>' +
      '<div style="display:flex;gap:8px">' +
      '<input class="input grow" id="tkUrl" value="' + esc(o.shippingDetails.trackingUrl) + '" placeholder="https://track.courier.com/..."> ' +
      (o.shippingDetails.trackingUrl ? '<a class="btn ghost sm" href="' + esc(o.shippingDetails.trackingUrl) + '" target="_blank" rel="noopener">' + icon('external') + 'Open</a>' : '') +
      '</div></div>' +
      '<div style="margin-top:14px;display:flex;justify-content:flex-end">' +
      '<button class="btn primary sm" id="btnSaveTracking">' + icon('save') + 'Save Tracking Info</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      // Column Right
      '<div style="display:flex;flex-direction:column;gap:20px">' +
      // Customer Card
      '<div class="order-card">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('user') + '<span>Customer Profile</span></div>' +
      '</div>' +
      '<div class="cust-card-body">' +
      '<div class="cust-user-row">' +
      '<div class="cust-avatar">' + esc(o.customerName.charAt(0).toUpperCase()) + '</div>' +
      '<div>' +
      '<div class="cust-name">' + esc(o.customerName) + '</div>' +
      (o.phone ? '<div class="cell-sub mono">' + esc(o.phone) + '</div>' : '') +
      (o.email ? '<div class="cell-sub">' + esc(o.email) + '</div>' : '') +
      '</div></div>' +
      '<div class="cust-actions">' +
      (cleanPhone ? '<a class="cust-action-btn whatsapp" href="https://wa.me/' + cleanPhone + '" target="_blank" rel="noopener">' + icon('zap') + 'WhatsApp</a>' : '') +
      (o.phone ? '<a class="cust-action-btn" href="tel:' + esc(o.phone) + '">' + icon('phone') + 'Call</a>' : '') +
      (o.phone ? '<button class="cust-action-btn" id="btnCopyPhone">' + icon('copy') + 'Copy Phone</button>' : '') +
      '</div>' +
      '<div style="margin-top:8px">' +
      '<div class="cell-sub" style="margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Delivery Address</div>' +
      '<div class="addr-box">' +
      '<div class="addr-content">' +
      '<span class="addr-icon">' + icon('map-pin') + '</span>' +
      '<div class="addr-text">' + esc(formattedAddress) + '</div>' +
      '</div>' +
      '<div style="margin-top:10px"><button class="btn ghost sm" id="btnCopyAddress">' + icon('copy') + 'Copy Address</button></div>' +
      '</div>' +
      '</div>' +
      '</div></div>' +

      // Payment & Totals Summary
      '<div class="order-card">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('rupee') + '<span>Financial Summary</span></div>' +
      '<span class="badge ' + payBadge + '"><i class="d"></i>' + esc(o.paymentStatus) + '</span>' +
      '</div>' +
      '<div class="summary-box">' +
      '<div class="summary-row"><span>Items Subtotal</span><span>' + money(o.subTotal || (o.total + o.discount - o.shippingFee)) + '</span></div>' +
      (o.discount > 0 ? '<div class="summary-row" style="color:var(--ok)"><span>Special Discount</span><span>− ' + money(o.discount) + '</span></div>' : '') +
      '<div class="summary-row"><span>Delivery Shipping Fee</span><span>' + (o.shippingFee > 0 ? money(o.shippingFee) : '<span class="badge ok" style="padding:1px 6px">Free Delivery</span>') + '</span></div>' +
      '<div class="summary-row total"><span>Total Payable</span><span class="amt">' + money(o.total) + '</span></div>' +
      '</div>' +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3);display:flex;flex-direction:column;gap:6px">' +
      '<div style="display:flex;justify-content:space-between"><span>Payment Method</span><b style="color:var(--ink)">' + esc(o.paymentMethod) + '</b></div>' +
      (o.paymentRef ? '<div style="display:flex;justify-content:space-between;align-items:center"><span>Payment Ref</span><span class="mono" style="color:var(--ink-2)">' + esc(o.paymentRef) + '</span></div>' : '') +
      '</div>' +
      '<div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn primary sm grow" id="btnSummaryPrintSlip" style="justify-content:center">' + icon('tag') + 'Print Order Slip (Courier)</button>' +
      '<button class="btn ghost sm" id="btnSummaryPreviewSlip" title="Preview Order Slip">' + icon('eye') + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn ghost sm grow" id="btnSummaryPrintInvoice" style="justify-content:center">' + icon('printer') + 'Print Customer Invoice</button>' +
      '<button class="btn ghost sm" id="btnSummaryPreviewInvoice" title="Preview Customer Invoice">' + icon('eye') + '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +

      // Status Management Card
      '<div class="order-card" style="border-color:rgba(200,255,0,0.25)">' +
      '<div class="order-card-head">' +
      '<div class="dsec-title-left">' + icon('settings') + '<span>Update Order Status</span></div>' +
      '</div>' +
      '<p class="cell-sub" style="font-size:12.5px;margin-bottom:12px">Select a new fulfillment status for this order. Marking as Cancelled or Returned will automatically restore inventory.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<select class="select" id="detailStatusSelect" style="height:44px;font-weight:600">' +
      CC.ORDER_STATUS.map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + s + (s === o.status ? ' (Current)' : '') + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn primary" id="btnUpdateOrderStatus" style="height:44px;justify-content:center">' + icon('check') + 'Update Status</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  // ---- Bind Interactive Events (Shared between Drawer & Full Page) ----------
  function bindOrderEvents(containerEl, o, onStatusUpdated) {
    // Copy Order ID
    var btnCopyId = containerEl.querySelector('#btnCopyOrderId');
    if (btnCopyId) {
      btnCopyId.addEventListener('click', function () {
        navigator.clipboard.writeText(o.orderNumber);
        CC.toast('Order number copied: ' + o.orderNumber, 'ok');
      });
    }

    // Copy Phone
    var btnCopyPhone = containerEl.querySelector('#btnCopyPhone');
    if (btnCopyPhone) {
      btnCopyPhone.addEventListener('click', function () {
        if (!o.phone) return;
        navigator.clipboard.writeText(o.phone);
        CC.toast('Phone number copied to clipboard', 'ok');
      });
    }

    // Copy Address
    var btnCopyAddress = containerEl.querySelector('#btnCopyAddress');
    if (btnCopyAddress) {
      btnCopyAddress.addEventListener('click', function () {
        var lines = [o.address.street, o.address.city, o.address.state, o.address.zip, o.address.country].filter(Boolean);
        navigator.clipboard.writeText(lines.join(', '));
        CC.toast('Delivery address copied', 'ok');
      });
    }

    // Order Slip / Courier Package Label Handlers
    var btnPrintSlip = containerEl.querySelector('#btnPrintOrderSlip');
    if (btnPrintSlip) {
      btnPrintSlip.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.printShippingSlip) global.Invoice.printShippingSlip(o);
        else if (global.CC && global.CC.printShippingSlip) global.CC.printShippingSlip(o);
      });
    }
    var btnPreviewSlip = containerEl.querySelector('#btnPreviewOrderSlip');
    if (btnPreviewSlip) {
      btnPreviewSlip.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.previewShippingSlip) global.Invoice.previewShippingSlip(o);
        else if (global.CC && global.CC.previewShippingSlip) global.CC.previewShippingSlip(o);
      });
    }
    var btnSummaryPrintSlip = containerEl.querySelector('#btnSummaryPrintSlip');
    if (btnSummaryPrintSlip) {
      btnSummaryPrintSlip.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.printShippingSlip) global.Invoice.printShippingSlip(o);
        else if (global.CC && global.CC.printShippingSlip) global.CC.printShippingSlip(o);
      });
    }
    var btnSummaryPreviewSlip = containerEl.querySelector('#btnSummaryPreviewSlip');
    if (btnSummaryPreviewSlip) {
      btnSummaryPreviewSlip.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.previewShippingSlip) global.Invoice.previewShippingSlip(o);
        else if (global.CC && global.CC.previewShippingSlip) global.CC.previewShippingSlip(o);
      });
    }

    // Customer Invoice Handlers
    var btnPrint = containerEl.querySelector('#btnPrintInvoice');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.printInvoice) global.Invoice.printInvoice(o);
        else if (global.CC && global.CC.printInvoice) global.CC.printInvoice(o);
        else window.print();
      });
    }
    var btnPreview = containerEl.querySelector('#btnPreviewInvoice');
    if (btnPreview) {
      btnPreview.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.previewInvoice) global.Invoice.previewInvoice(o);
        else if (global.CC && global.CC.previewInvoice) global.CC.previewInvoice(o);
      });
    }
    var btnSummaryPrint = containerEl.querySelector('#btnSummaryPrintInvoice');
    if (btnSummaryPrint) {
      btnSummaryPrint.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.printInvoice) global.Invoice.printInvoice(o);
        else if (global.CC && global.CC.printInvoice) global.CC.printInvoice(o);
        else window.print();
      });
    }
    var btnSummaryPreview = containerEl.querySelector('#btnSummaryPreviewInvoice');
    if (btnSummaryPreview) {
      btnSummaryPreview.addEventListener('click', function () {
        if (global.Invoice && global.Invoice.previewInvoice) global.Invoice.previewInvoice(o);
        else if (global.CC && global.CC.previewInvoice) global.CC.previewInvoice(o);
      });
    }

    // Save Tracking
    var btnSaveTracking = containerEl.querySelector('#btnSaveTracking');
    if (btnSaveTracking) {
      btnSaveTracking.addEventListener('click', function () {
        var courier = (containerEl.querySelector('#tkCourier').value || '').trim();
        var awb = (containerEl.querySelector('#tkAwb').value || '').trim();
        var url = (containerEl.querySelector('#tkUrl').value || '').trim();

        btnSaveTracking.disabled = true;
        btnSaveTracking.innerHTML = UI.spinner() + ' Saving…';

        CC.API.put('/orders/' + o._id, {
          shippingDetails: {
            courierName: courier,
            awb: awb,
            trackingUrl: url
          }
        }).then(function () {
          CC.toast('Tracking information updated successfully', 'ok');
          o.shippingDetails.courierName = courier;
          o.shippingDetails.awb = awb;
          o.shippingDetails.trackingUrl = url;
        }).catch(function (err) {
          CC.toast(err.message || 'Failed to update tracking', 'bad');
        }).then(function () {
          btnSaveTracking.disabled = false;
          btnSaveTracking.innerHTML = icon('save') + 'Save Tracking Info';
        });
      });
    }

    // Update Status
    var btnUpdateStatus = containerEl.querySelector('#btnUpdateOrderStatus');
    var statusSelect = containerEl.querySelector('#detailStatusSelect');
    if (btnUpdateStatus && statusSelect) {
      btnUpdateStatus.addEventListener('click', function () {
        var next = statusSelect.value;
        if (next === o.status) {
          CC.toast('Order is already marked as ' + next);
          return;
        }

        var danger = next === 'Cancelled' || next === 'Returned';
        var proceed = danger ?
          CC.confirmModal({
            title: 'Mark order as ' + next + '?',
            body: 'This will update the order and automatically restore stock for all line items to inventory. Continue?',
            ok: 'Confirm ' + next,
            danger: true
          }) :
          Promise.resolve(true);

        proceed.then(function (confirmed) {
          if (!confirmed) return;
          btnUpdateStatus.disabled = true;
          btnUpdateStatus.innerHTML = UI.spinner() + ' Updating…';

          CC.API.put('/orders/' + o._id, { status: next }).then(function () {
            CC.toast('Order status changed to ' + next, 'ok');
            o.status = next;
            if (typeof onStatusUpdated === 'function') onStatusUpdated(next);
          }).catch(function (err) {
            CC.toast(err.message || 'Failed to update status', 'bad');
            btnUpdateStatus.disabled = false;
            btnUpdateStatus.innerHTML = icon('check') + 'Update Status';
          });
        });
      });
    }

    // Request Review
    var reviewBtns = containerEl.querySelectorAll('.btn-request-review');
    reviewBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (e) e.stopPropagation();
        var pid = btn.getAttribute('data-product-id');
        btn.disabled = true;
        var originalHtml = btn.innerHTML;
        btn.innerHTML = UI.spinner() + ' Copying…';
        
        CC.API.post('/reviews/request/' + o._id, { productId: pid }).then(function (res) {
          var storeUrl = CC.getStorefrontUrl();
          var url = storeUrl + '/review?token=' + encodeURIComponent(res.token);
          
          CC.copy(url).then(function () {
            btn.innerHTML = icon('check') + ' Copied!';
            btn.style.borderColor = 'var(--ok)';
            btn.style.color = 'var(--ok)';
            
            var msg = res.message && res.message !== 'Review request generated' ? res.message : 'Review link copied to clipboard!';
            CC.toast(msg, 'ok');
            
            setTimeout(function() {
              btn.innerHTML = originalHtml;
              btn.disabled = false;
              btn.style.borderColor = '';
              btn.style.color = '';
            }, 3000);
          });
        }).catch(function (err) {
          CC.toast(err.message || 'Failed to generate review link', 'bad');
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        });
      });
    });
  }

  // ---- Slide-over Drawer Mode -----------------------------------------------
  function openOrder(id) {
    var drawer = UI.openDrawer({
      title: 'Order Details',
      sub: 'Loading…',
      wide: true,
      actionsHtml: '<button class="icon-btn" id="drwPrint" title="Print Tax Invoice">' + icon('printer') + '</button>' +
                   '<button class="icon-btn" id="drwPreview" title="Preview Tax Invoice">' + icon('eye') + '</button>' +
                   '<a class="icon-btn" id="drwExpand" href="#/orders/' + encodeURIComponent(id) + '" title="Open full page">' + icon('maximize') + '</a>',
      bodyHtml: '<div style="padding:60px 0">' + UI.spinner() + '</div>',
      onMount: function (drawerEl, close) {
        CC.API.get('/orders/' + id).then(function (raw) {
          var o = normalizeOrder(raw);
          var printBtn = drawerEl.querySelector('#drwPrint');
          if (printBtn) {
            printBtn.onclick = function () {
              if (global.Invoice) global.Invoice.print(o);
              else window.print();
            };
          }
          var prevBtn = drawerEl.querySelector('#drwPreview');
          if (prevBtn) {
            prevBtn.onclick = function () {
              if (global.Invoice) global.Invoice.preview(o);
            };
          }
          var payBadge = o.paymentStatus === 'Paid' ? 'ok' : o.paymentStatus === 'Failed' ? 'bad' : 'warn';
          drawerEl.querySelector('.drawer-head h2').innerHTML =
            icon('package') + ' <span>' + esc(o.orderNumber) + '</span>' +
            '<button class="icon-btn sm" id="btnCopyOrderId" title="Copy Order ID" style="margin-left:6px">' + icon('copy') + '</button>';
          drawerEl.querySelector('.drawer-head .sub').innerHTML =
            '<div>' + esc(o.customerName) + ' · Placed ' + CC.dateLong(o.createdAt) + ' (' + CC.timeAgo(o.createdAt) + ')</div>' +
            '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">' +
            '<span class="badge ' + CC.orderBadgeClass(o.status) + '" style="font-size:11px;padding:2px 8px"><i class="d"></i>' + esc(o.status) + '</span>' +
            '<span class="badge ' + payBadge + '" style="font-size:11px;padding:2px 8px"><i class="d"></i>' + esc(o.paymentMethod) + ' · ' + esc(o.paymentStatus) + '</span>' +
            (o.paymentRef ? '<span class="cell-sub mono" style="font-size:11px">Ref: ' + esc(o.paymentRef) + '</span>' : '') +
            '</div>';

          var bodyEl = drawerEl.querySelector('#drawerBody');
          bodyEl.innerHTML = buildOrderDetailsHtml(o, false);

          bindOrderEvents(drawerEl, o, function (newStatus) {
            close();
            if (global.App && global.App.render) global.App.render();
          });
        }).catch(function (err) {
          drawerEl.querySelector('#drawerBody').innerHTML = UI.errorState(err.message);
        });
      }
    });
  }

  // ---- Dedicated Full Page Mode ---------------------------------------------
  function renderFullPageOrder(root, id) {
    root.innerHTML =
      '<div class="order-page-container">' +
      '<div class="order-page-topbar">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<button class="btn ghost" id="btnBackToOrders">' + icon('chevron-left') + 'Back to Orders</button>' +
      '<div class="crumbs" style="margin-left:8px"><span>Orders</span>' + icon('chevron-right') + '<b>' + esc(id) + '</b></div>' +
      '</div>' +
      '<div class="head-actions">' +
      '<button class="btn" id="btnPageRefresh">' + icon('refresh') + 'Refresh</button>' +
      '</div>' +
      '</div>' +
      '<div id="orderPageContent">' +
      UI.skelKpis(4) +
      '<div style="margin-top:20px">' + UI.skelRows(6, 6) + '</div>' +
      '</div>' +
      '</div>';

    root.querySelector('#btnBackToOrders').addEventListener('click', function () {
      if (global.App && global.App.navigate) global.App.navigate('orders');
      else location.hash = '#/orders';
    });

    function fetchAndRender() {
      var contentEl = root.querySelector('#orderPageContent');
      contentEl.innerHTML = '<div style="padding:80px 0;text-align:center">' + UI.spinner() + '</div>';

      CC.API.get('/orders/' + id).then(function (raw) {
        var o = normalizeOrder(raw);
        contentEl.innerHTML = buildOrderDetailsHtml(o, true);

        bindOrderEvents(contentEl, o, function (newStatus) {
          fetchAndRender();
        });
      }).catch(function (err) {
        contentEl.innerHTML = UI.errorState(err.message, 'ordPageRetry');
        var retry = contentEl.querySelector('#ordPageRetry');
        if (retry) retry.addEventListener('click', fetchAndRender);
      });
    }

    root.querySelector('#btnPageRefresh').addEventListener('click', fetchAndRender);
    fetchAndRender();
  }

  global.Views.orders = {
    title: 'Orders',
    crumb: 'Orders',
    render: render,
    open: openOrder
  };
})(window);
