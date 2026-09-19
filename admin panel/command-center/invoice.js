/* ============================================================================
   CHROMVAULT INVOICE & DISPATCH ENGINE
   Supports:
   1. Clean Customer Invoice: Product details, costs, From & To addresses.
   2. Order Slip / Courier Package Label: Sticker-ready dispatch label to stick on
      packages with prominent FROM & TO addresses, barcode, and contents summary.
   3. Dynamic From Address configured easily via Admin Settings.
   ========================================================================== */
(function (global) {
  'use strict';

  var CC = global.CC || {};
  var esc = (CC && CC.esc) ? CC.esc : function (s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = (CC && CC.money) ? CC.money : function (n) {
    var v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  // Default Store / Dispatch From Address settings (Simple & direct)
  var DEFAULT_FROM_SETTINGS = {
    storeName: 'CHROMVAULT',
    phone: '+91 9400 123 456',
    address: 'Hill View Arcade, NH 66, Kakkanchery, Malappuram, Kerala - 671321, India'
  };

  var _cachedFromSettings = null;

  function formatCombinedAddress(data) {
    if (!data) return DEFAULT_FROM_SETTINGS.address;
    if (data.address && data.address.trim()) return data.address.trim();
    var parts = [
      data.addressLine1,
      data.addressLine2,
      data.city,
      data.state ? (data.state + (data.pincode ? ' - ' + data.pincode : '')) : data.pincode,
      data.country
    ].filter(Boolean);
    return parts.join(', ') || DEFAULT_FROM_SETTINGS.address;
  }

  function getDefaultFromSettings() {
    return Object.assign({}, DEFAULT_FROM_SETTINGS);
  }

  function getFromSettings() {
    if (_cachedFromSettings) return _cachedFromSettings;
    try {
      var raw = localStorage.getItem('chromvault_from_settings');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          _cachedFromSettings = {
            storeName: parsed.storeName || DEFAULT_FROM_SETTINGS.storeName,
            phone: parsed.phone || DEFAULT_FROM_SETTINGS.phone,
            address: formatCombinedAddress(parsed)
          };
          return _cachedFromSettings;
        }
      }
    } catch (e) {}
    _cachedFromSettings = Object.assign({}, DEFAULT_FROM_SETTINGS);
    return _cachedFromSettings;
  }

  function saveFromSettings(data) {
    var merged = {
      storeName: (data && data.storeName) ? data.storeName.trim() : DEFAULT_FROM_SETTINGS.storeName,
      phone: (data && data.phone) ? data.phone.trim() : DEFAULT_FROM_SETTINGS.phone,
      address: (data && data.address) ? data.address.trim() : formatCombinedAddress(data)
    };
    _cachedFromSettings = merged;
    try {
      localStorage.setItem('chromvault_from_settings', JSON.stringify(merged));
    } catch (e) {}

    // Persist to backend API if available
    if (CC && CC.API && CC.API.put) {
      CC.API.put('/admin/settings/from_address', { value: merged }).catch(function () {});
    }
    return merged;
  }

  function resetFromSettings() {
    _cachedFromSettings = Object.assign({}, DEFAULT_FROM_SETTINGS);
    try {
      localStorage.removeItem('chromvault_from_settings');
    } catch (e) {}
    if (CC && CC.API && CC.API.put) {
      CC.API.put('/admin/settings/from_address', { value: _cachedFromSettings }).catch(function () {});
    }
    return _cachedFromSettings;
  }

  function syncFromBackend() {
    if (CC && CC.API && CC.API.get) {
      return CC.API.get('/admin/settings/from_address')
        .then(function (res) {
          if (res && res.value && typeof res.value === 'object') {
            _cachedFromSettings = {
              storeName: res.value.storeName || DEFAULT_FROM_SETTINGS.storeName,
              phone: res.value.phone || DEFAULT_FROM_SETTINGS.phone,
              address: formatCombinedAddress(res.value)
            };
            try {
              localStorage.setItem('chromvault_from_settings', JSON.stringify(_cachedFromSettings));
            } catch (e) {}
          }
          return getFromSettings();
        })
        .catch(function () {
          return getFromSettings();
        });
    }
    return Promise.resolve(getFromSettings());
  }

  try { setTimeout(syncFromBackend, 300); } catch (e) {}

  // Vector Barcode for Order ID
  function generateBarcodeSvg(code) {
    var bars = [
      2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 3, 1, 1, 2, 3, 2, 1, 1, 2, 3,
      1, 2, 2, 3, 1, 1, 3, 2, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 2, 2,
      1, 2, 3, 1, 2, 2, 1, 1, 3, 2, 1, 2, 2, 3, 1, 1, 2, 3, 1, 2
    ];
    var x = 10;
    var rects = '';
    for (var i = 0; i < bars.length; i++) {
      var w = bars[i];
      if (i % 2 === 0) {
        rects += '<rect x="' + x + '" y="0" width="' + w + '" height="32" fill="#111827" />';
      }
      x += w;
    }
    return '<svg viewBox="0 0 ' + (x + 10) + ' 44" width="170" height="38" style="display:block;">' +
      rects +
      '<text x="' + ((x + 10) / 2) + '" y="42" font-family="monospace" font-size="9" font-weight="bold" fill="#374151" text-anchor="middle" letter-spacing="2">' +
      esc(code) +
      '</text></svg>';
  }

  // Helper for customer address string
  function getCustomerAddress(o) {
    var addr = o.address || {};
    var parts = [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
    return parts.join(', ') || 'No delivery address specified';
  }

  // ============================================================================
  // 1. CLEAN CUSTOMER INVOICE (Focuses on From, Customer, Products & Total Cost)
  // ============================================================================
  function buildInvoiceHtml(o, fromOverride) {
    var from = fromOverride || getFromSettings();
    var isPaid = (o.paymentStatus || '').toLowerCase() === 'paid';
    var customerAddr = getCustomerAddress(o);

    var subtotal = o.subTotal || (o.total + (o.discount || 0) - (o.shippingFee || 0));
    var discount = o.discount || 0;
    var shippingFee = o.shippingFee || 0;
    var grandTotal = o.total || 0;

    var itemsRows = (o.items && o.items.length) ? o.items.map(function (it, idx) {
      var qty = it.quantity || 1;
      var price = it.price || 0;
      var total = price * qty;
      return '<tr>' +
        '<td class="text-center">' + (idx + 1) + '</td>' +
        '<td>' +
          '<div class="item-title">' + esc(it.name) + '</div>' +
          (it.variant ? '<div class="item-variant">Variant: ' + esc(it.variant) + '</div>' : '') +
        '</td>' +
        '<td class="text-center bold">' + qty + '</td>' +
        '<td class="text-right">' + money(price) + '</td>' +
        '<td class="text-right bold">' + money(total) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" class="text-center" style="padding:20px">No items</td></tr>';

    var invoiceNum = o.invoice ? ('INV-' + o.invoice.replace(/^#/, '')) : ('INV-' + (o.orderNumber || '000').replace(/^ORD-/, ''));

    return '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<title>Invoice - ' + esc(o.orderNumber || 'Order') + ' - ' + esc(from.storeName) + '</title>' +
      '<style>' +
      '  @page { size: A4 portrait; margin: 12mm 14mm; }' +
      '  * { box-sizing: border-box; margin: 0; padding: 0; }' +
      '  body {' +
      '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;' +
      '    background: #ffffff; color: #111827; font-size: 12px; line-height: 1.5;' +
      '    -webkit-print-color-adjust: exact; print-color-adjust: exact;' +
      '  }' +
      '  .invoice-container {' +
      '    max-width: 800px; margin: 0 auto; padding: 28px 32px; background: #fff;' +
      '  }' +
      '  .inv-header {' +
      '    display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;' +
      '    padding-bottom: 20px; border-bottom: 2px solid #111827;' +
      '  }' +
      '  .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #111827; line-height: 1; }' +
      '  .from-box { font-size: 11px; color: #4b5563; margin-top: 8px; line-height: 1.5; max-width: 380px; }' +
      '  .from-box b { color: #111827; }' +
      '  .inv-meta { text-align: right; }' +
      '  .inv-heading { font-size: 20px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #111827; margin-bottom: 4px; }' +
      '  .meta-table { font-size: 11.5px; margin-top: 6px; }' +
      '  .meta-table td { padding: 2px 0 2px 14px; text-align: right; }' +
      '  .meta-table td.lbl { color: #6b7280; }' +
      '  .meta-table td.val { font-weight: 700; font-family: ui-monospace, monospace; color: #111827; }' +
      '  .badge-paid {' +
      '    display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 10.5px; font-weight: 700;' +
      '    letter-spacing: 0.08em; text-transform: uppercase; margin-top: 8px;' +
      '    background: ' + (isPaid ? '#ecfdf5; color: #047857; border: 1.5px solid #059669;' : '#fffbeb; color: #b45309; border: 1.5px solid #d97706;') +
      '  }' +
      '  /* Address Grid */' +
      '  .parties-grid {' +
      '    display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;' +
      '  }' +
      '  .party-card { padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa; }' +
      '  .party-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 6px; }' +
      '  .party-name { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 4px; }' +
      '  .party-body { font-size: 11.5px; color: #4b5563; line-height: 1.5; }' +
      '  /* Items Table */' +
      '  .items-table { width: 100%; border-collapse: collapse; margin-top: 8px; }' +
      '  .items-table th {' +
      '    background: #111827; color: #ffffff; font-size: 10px; font-weight: 700;' +
      '    text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 12px; border: 1px solid #111827;' +
      '  }' +
      '  .items-table td { padding: 11px 12px; border: 1px solid #e5e7eb; font-size: 11.5px; vertical-align: middle; }' +
      '  .items-table tr:nth-child(even) td { background: #fafafa; }' +
      '  .item-title { font-weight: 700; color: #111827; font-size: 12px; }' +
      '  .item-variant { font-size: 10.5px; color: #6b7280; margin-top: 2px; }' +
      '  .text-center { text-align: center; }' +
      '  .text-right { text-align: right; }' +
      '  .bold { font-weight: 700; }' +
      '  /* Totals */' +
      '  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 18px; }' +
      '  .totals-table { width: 280px; border-collapse: collapse; }' +
      '  .totals-table td { padding: 6px 8px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }' +
      '  .totals-table td.val { text-align: right; font-weight: 600; font-family: ui-monospace, monospace; }' +
      '  .totals-table tr.grand td { border-top: 2px solid #111827; border-bottom: 2px solid #111827; padding: 10px 8px; font-size: 14.5px; font-weight: 800; color: #111827; }' +
      '  .totals-table tr.grand td.val { font-size: 16px; }' +
      '  .foot-row { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280; }' +
      '  /* Screen control bar */' +
      '  .screen-bar { position: sticky; top: 0; z-index: 100; background: #111827; color: #fff; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); margin-bottom: 16px; }' +
      '  .screen-bar button { background: #c8ff00; color: #000; font-weight: 700; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }' +
      '  .screen-bar .close-btn { background: transparent; color: #9ca3af; border: 1px solid #374151; margin-left: 10px; }' +
      '  @media print { .screen-bar { display: none !important; } .invoice-container { padding: 0 !important; max-width: 100% !important; } }' +
      '</style>' +
      '</head>' +
      '<body>' +

      '<div class="screen-bar">' +
      '<div><b>Customer Invoice</b> &mdash; ' + esc(o.orderNumber || 'Order') + ' (' + esc(o.customerName || 'Customer') + ')</div>' +
      '<div>' +
      '<button onclick="window.print()">Print Invoice (PDF)</button>' +
      '<button class="close-btn" onclick="window.close()">Close Window</button>' +
      '</div>' +
      '</div>' +

      '<div class="invoice-container">' +
      // Header
      '<div class="inv-header">' +
      '<div>' +
      '<div class="brand-title">' + esc(from.storeName) + '</div>' +
      '<div class="from-box">' +
      '<b>Dispatched From:</b><br>' +
      esc(from.address) + '<br>' +
      (from.phone ? ('Contact Phone: <b>' + esc(from.phone) + '</b>') : '') +
      '</div>' +
      '</div>' +

      '<div class="inv-meta">' +
      '<div class="inv-heading">INVOICE</div>' +
      '<table class="meta-table">' +
      '<tr><td class="lbl">Invoice No:</td><td class="val">' + esc(invoiceNum) + '</td></tr>' +
      '<tr><td class="lbl">Order ID:</td><td class="val">' + esc(o.orderNumber || '—') + '</td></tr>' +
      '<tr><td class="lbl">Date:</td><td class="val">' + esc(o.createdAt ? CC.dateShort(o.createdAt) : CC.dateShort(Date.now())) + '</td></tr>' +
      '</table>' +
      '<div class="badge-paid">' + (isPaid ? '&#10003; PAYMENT PAID' : '&#9679; PAYMENT ' + esc(o.paymentStatus || 'Pending').toUpperCase()) + '</div>' +
      '</div>' +
      '</div>' +

      // Parties Grid
      '<div class="parties-grid">' +
      '<div class="party-card">' +
      '<div class="party-label">Billed &amp; Delivered To (Customer)</div>' +
      '<div class="party-name">' + esc(o.customerName || 'Customer') + '</div>' +
      '<div class="party-body">' +
      (o.phone ? ('Phone: <b>' + esc(o.phone) + '</b><br>') : '') +
      (o.email ? ('Email: ' + esc(o.email) + '<br>') : '') +
      'Address: ' + esc(customerAddr) +
      '</div>' +
      '</div>' +

      '<div class="party-card">' +
      '<div class="party-label">Order &amp; Fulfillment Reference</div>' +
      '<div class="party-body" style="font-size:12px">' +
      'Order Status: <b>' + esc(o.status || 'Processing') + '</b><br>' +
      'Payment Method: <b>' + esc(o.paymentMethod || 'Prepaid') + '</b><br>' +
      (o.paymentRef ? ('Payment Reference: <code style="font-size:11px;font-weight:700">' + esc(o.paymentRef) + '</code><br>') : '') +
      (o.shippingDetails && o.shippingDetails.courierName ? ('Courier: <b>' + esc(o.shippingDetails.courierName) + '</b><br>') : '') +
      (o.shippingDetails && o.shippingDetails.awb ? ('AWB / Tracking: <b>' + esc(o.shippingDetails.awb) + '</b>') : '') +
      '</div>' +
      '</div>' +
      '</div>' +

      // Line items table
      '<table class="items-table">' +
      '<thead>' +
      '<tr>' +
      '<th style="width:36px">#</th>' +
      '<th>Product Description</th>' +
      '<th style="width:50px" class="text-center">Qty</th>' +
      '<th style="width:100px" class="text-right">Unit Price</th>' +
      '<th style="width:110px" class="text-right">Total Price</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      itemsRows +
      '</tbody>' +
      '</table>' +

      // Totals
      '<div class="totals-wrap">' +
      '<table class="totals-table">' +
      '<tr><td>Items Subtotal:</td><td class="val">' + money(subtotal) + '</td></tr>' +
      (discount > 0 ? '<tr style="color:#059669"><td>Discount:</td><td class="val">− ' + money(discount) + '</td></tr>' : '') +
      '<tr><td>Shipping / Delivery:</td><td class="val">' + (shippingFee > 0 ? money(shippingFee) : 'FREE') + '</td></tr>' +
      '<tr class="grand"><td>Total Amount:</td><td class="val">' + money(grandTotal) + '</td></tr>' +
      '</table>' +
      '</div>' +

      // Footer
      '<div class="foot-row">' +
      '<span>' + esc(from.storeName) + ' &bull; Thank you for your purchase!</span>' +
      '<span>Generated: ' + esc(CC.dateLong ? CC.dateLong(Date.now()) : new Date().toLocaleString()) + '</span>' +
      '</div>' +

      '</div>' +
      '</body>' +
      '</html>';
  }

  // ============================================================================
  // 2. ORDER SLIP / COURIER PACKAGE LABEL (Sticker to stick on courier parcel)
  // ============================================================================
  function buildShippingSlipHtml(o, fromOverride) {
    var from = fromOverride || getFromSettings();
    var customerAddr = getCustomerAddress(o);
    var shippingDetails = o.shippingDetails || {};

    var itemsList = (o.items && o.items.length) ? o.items.map(function (it, idx) {
      return '<tr>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:11px">' + (idx + 1) + '. ' + esc(it.name) + (it.variant ? ' (' + esc(it.variant) + ')' : '') + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;text-align:center;width:40px">Qty: ' + (it.quantity || 1) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="2" style="padding:6px;font-size:11px">No item details</td></tr>';

    return '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<title>Order Slip - ' + esc(o.orderNumber || 'Slip') + '</title>' +
      '<style>' +
      '  @page { size: 100mm 150mm; margin: 4mm; }' +
      '  * { box-sizing: border-box; margin: 0; padding: 0; }' +
      '  body {' +
      '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;' +
      '    background: #ffffff; color: #111827; font-size: 11.5px; line-height: 1.4;' +
      '    -webkit-print-color-adjust: exact; print-color-adjust: exact;' +
      '  }' +
      '  .slip-container {' +
      '    max-width: 420px; margin: 0 auto; padding: 14px; border: 2px dashed #111827; border-radius: 8px;' +
      '    background: #ffffff;' +
      '  }' +
      '  .slip-head {' +
      '    display: flex; justify-content: space-between; align-items: center;' +
      '    padding-bottom: 10px; border-bottom: 2px solid #111827;' +
      '  }' +
      '  .slip-title { font-size: 16px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #111827; }' +
      '  .slip-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; background: #111827; color: #fff; border-radius: 4px; }' +
      '  /* Barcode section */' +
      '  .barcode-box {' +
      '    text-align: center; padding: 10px 0 8px;' +
      '    border-bottom: 1.5px solid #e5e7eb;' +
      '    display: flex; flex-direction: column; align-items: center;' +
      '  }' +
      '  .ord-num { font-size: 15px; font-weight: 900; letter-spacing: 0.08em; margin-bottom: 4px; font-family: monospace; }' +
      '  /* Address Boxes */' +
      '  .addr-card {' +
      '    margin: 10px 0; padding: 10px 12px; border: 1.5px solid #111827; border-radius: 6px; background: #f9fafb;' +
      '  }' +
      '  .addr-card.to { background: #ffffff; border-width: 2px; }' +
      '  .addr-tag { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.14em; color: #fff; background: #111827; display: inline-block; padding: 1px 6px; border-radius: 3px; margin-bottom: 5px; }' +
      '  .addr-name { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 3px; }' +
      '  .addr-text { font-size: 11.5px; color: #1f2937; line-height: 1.45; }' +
      '  .addr-phone { font-size: 12px; font-weight: 700; color: #111827; margin-top: 4px; }' +
      '  /* Contents box */' +
      '  .contents-box { margin-top: 10px; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; }' +
      '  .contents-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }' +
      '  .contents-table { width: 100%; border-collapse: collapse; }' +
      '  .slip-foot {' +
      '    margin-top: 10px; text-align: center; font-size: 9.5px; font-weight: 600; color: #6b7280; letter-spacing: 0.04em;' +
      '  }' +
      '  /* Screen control bar */' +
      '  .screen-bar { position: sticky; top: 0; z-index: 100; background: #111827; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }' +
      '  .screen-bar button { background: #c8ff00; color: #000; font-weight: 700; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; }' +
      '  @media print { .screen-bar { display: none !important; } .slip-container { border: none !important; max-width: 100% !important; padding: 0 !important; } }' +
      '</style>' +
      '</head>' +
      '<body>' +

      '<div class="screen-bar">' +
      '<div><b>Courier Order Slip (Package Label)</b> &mdash; ' + esc(o.orderNumber || 'Slip') + '</div>' +
      '<div>' +
      '<button onclick="window.print()">Print Package Label</button>' +
      '<button onclick="window.close()" style="background:transparent;color:#9ca3af;border:1px solid #374151;margin-left:8px">Close</button>' +
      '</div>' +
      '</div>' +

      '<div class="slip-container">' +
      // Head
      '<div class="slip-head">' +
      '<div class="slip-title">' + esc(from.storeName) + '</div>' +
      '<div class="slip-badge">PARCEL DISPATCH SLIP</div>' +
      '</div>' +

      // Barcode & Order Number
      '<div class="barcode-box">' +
      '<div class="ord-num">' + esc(o.orderNumber || 'ORD-000') + '</div>' +
      generateBarcodeSvg(o.orderNumber || 'ORD-000') +
      '<div style="font-size:10px;color:#6b7280;margin-top:3px">' +
      'Date: ' + esc(o.createdAt ? CC.dateShort(o.createdAt) : CC.dateShort(Date.now())) +
      ' &bull; Mode: <b>' + esc(o.paymentMethod || 'Prepaid') + ' (' + esc(o.paymentStatus || 'Paid') + ')</b>' +
      (shippingDetails.courierName ? (' &bull; ' + esc(shippingDetails.courierName)) : '') +
      '</div>' +
      '</div>' +

      // 1. SHIP TO (Customer Address - Prominent)
      '<div class="addr-card to">' +
      '<div class="addr-tag">DELIVER TO (CUSTOMER):</div>' +
      '<div class="addr-name">' + esc(o.customerName || 'Customer') + '</div>' +
      '<div class="addr-text">' + esc(customerAddr) + '</div>' +
      (o.phone ? ('<div class="addr-phone">Phone: ' + esc(o.phone) + '</div>') : '') +
      '</div>' +

      // 2. DISPATCHED FROM (Return Address)
      '<div class="addr-card">' +
      '<div class="addr-tag" style="background:#4b5563">FROM (SENDER / RETURN TO):</div>' +
      '<div class="addr-name" style="font-size:12.5px">' + esc(from.storeName) + '</div>' +
      '<div class="addr-text">' + esc(from.address) + '</div>' +
      (from.phone ? ('<div class="addr-phone" style="font-size:11px">Phone: ' + esc(from.phone) + '</div>') : '') +
      '</div>' +

      // Package Contents Summary
      '<div class="contents-box">' +
      '<div class="contents-title">Package Contents (' + ((o.items && o.items.length) || 0) + ' items):</div>' +
      '<table class="contents-table">' +
      itemsList +
      '</table>' +
      '</div>' +

      // Instruction footer
      '<div class="slip-foot">' +
      'STICK THIS DISPATCH SLIP SECURELY ON COURIER PACKAGE' +
      '</div>' +

      '</div>' +
      '</body>' +
      '</html>';
  }

  // ============================================================================
  // PRINT & PREVIEW HANDLERS
  // ============================================================================
  function printHtml(html) {
    var iframe = document.getElementById('chromvaultPrintFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'chromvaultPrintFrame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(function () {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 450);
  }

  function openTabHtml(html) {
    var win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } else {
      printHtml(html);
    }
  }

  function previewModal(html, title, badgeText) {
    var existing = document.getElementById('invPreviewModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'invPreviewModal';
    modal.className = 'inv-modal-overlay';
    modal.innerHTML =
      '<div class="inv-modal-dialog">' +
      '<div class="inv-modal-head">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-weight:700;font-size:15px;color:var(--ink)">' + esc(title) + '</span>' +
      (badgeText ? ('<span class="badge ok">' + esc(badgeText) + '</span>') : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<button class="btn primary sm" id="modalPrintBtn">' + global.icon('printer') + 'Print / Save PDF</button>' +
      '<button class="btn ghost sm" id="modalTabBtn">' + global.icon('external') + 'Open in New Tab</button>' +
      '<button class="icon-btn sm" id="modalCloseBtn">' + global.icon('x') + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="inv-modal-body">' +
      '<iframe id="invPreviewFrame" style="width:100%;height:100%;border:none;background:#fff;border-radius:8px"></iframe>' +
      '</div>' +
      '</div>';

    document.body.appendChild(modal);

    var frame = modal.querySelector('#invPreviewFrame');
    var doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    function close() {
      modal.remove();
    }

    modal.querySelector('#modalCloseBtn').onclick = close;
    modal.onclick = function (e) {
      if (e.target === modal) close();
    };
    modal.querySelector('#modalPrintBtn').onclick = function () {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
    modal.querySelector('#modalTabBtn').onclick = function () {
      openTabHtml(html);
    };
  }

  // Invoice Actions
  function printInvoice(order, fromOverride) {
    if (!order) return;
    printHtml(buildInvoiceHtml(order, fromOverride));
  }
  function previewInvoice(order, fromOverride) {
    if (!order) return;
    var html = buildInvoiceHtml(order, fromOverride);
    previewModal(html, 'Customer Invoice — ' + (order.orderNumber || 'Order'), order.paymentStatus || 'Paid');
  }
  function openInvoiceTab(order, fromOverride) {
    if (!order) return;
    openTabHtml(buildInvoiceHtml(order, fromOverride));
  }

  // Shipping Slip (Package Label) Actions
  function printShippingSlip(order, fromOverride) {
    if (!order) return;
    printHtml(buildShippingSlipHtml(order, fromOverride));
  }
  function previewShippingSlip(order, fromOverride) {
    if (!order) return;
    var html = buildShippingSlipHtml(order, fromOverride);
    previewModal(html, 'Courier Order Slip — ' + (order.orderNumber || 'Package Sticker'), 'Courier Package Label');
  }
  function openShippingSlipTab(order, fromOverride) {
    if (!order) return;
    openTabHtml(buildShippingSlipHtml(order, fromOverride));
  }

  global.Invoice = {
    // Invoice
    buildInvoiceHtml: buildInvoiceHtml,
    buildHtml: buildInvoiceHtml,
    printInvoice: printInvoice,
    print: printInvoice,
    previewInvoice: previewInvoice,
    preview: previewInvoice,
    openInvoiceTab: openInvoiceTab,
    openTab: openInvoiceTab,

    // Shipping / Order Slip
    buildShippingSlipHtml: buildShippingSlipHtml,
    printShippingSlip: printShippingSlip,
    previewShippingSlip: previewShippingSlip,
    openShippingSlipTab: openShippingSlipTab,

    // Settings
    getFromSettings: getFromSettings,
    saveFromSettings: saveFromSettings,
    resetFromSettings: resetFromSettings,
    getDefaultFromSettings: getDefaultFromSettings,
    syncFromBackend: syncFromBackend
  };

  // Expose on global CC
  if (global.CC) {
    global.CC.printInvoice = printInvoice;
    global.CC.previewInvoice = previewInvoice;
    global.CC.openInvoiceTab = openInvoiceTab;
    global.CC.printShippingSlip = printShippingSlip;
    global.CC.previewShippingSlip = previewShippingSlip;
    global.CC.openShippingSlipTab = openShippingSlipTab;
  }
})(window);
