/* ============================================================================
   View: Settings — Luxury Admin Control Center
   Tabs: Store & Shipping, Storefront Media, Alerts & Audio, Account & Team.
   Built with a modern, high-end commerce design system.
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc;

  function render(root) {
    var info = CC.Session.get() || {};
    var role = (info.role || 'admin').toString();
    var isSuper = role.toLowerCase() === 'super admin' || role.toLowerCase() === 'superadmin';
    var name = info.name || 'Admin';
    if (typeof name === 'object' && name !== null) {
      name = name.en || Object.values(name)[0] || 'Admin';
    }
    var initial = (name.trim()[0] || 'A').toUpperCase();

    // Load current From Address settings
    var fromSettings = (global.Invoice && global.Invoice.getFromSettings)
      ? global.Invoice.getFromSettings()
      : {
          storeName: 'VANTRO',
          phone: '+91 9400 123 456',
          address: 'Hill View Arcade, NH 66, Kakkanchery, Malappuram, Kerala - 671321, India'
        };

    // Load delivery rules (Kerala is always free, Outside Kerala configurable)
    var deliveryRules = {
      keralaDeliveryFee: 0,
      outsideKeralaMinFreeOrder: 999,
      outsideKeralaDeliveryFee: 50
    };
    try {
      var savedDR = localStorage.getItem('vantro_delivery_rules');
      if (savedDR) deliveryRules = Object.assign(deliveryRules, JSON.parse(savedDR));
    } catch (e) {}

    // Active tab memory (defaults to 'shipping')
    var activeTabKey = 'vantro_settings_tab_v2';
    var initialTab = localStorage.getItem(activeTabKey) || 'shipping';
    if (!['shipping', 'media', 'alerts', 'account'].includes(initialTab)) {
      initialTab = 'shipping';
    }

    root.innerHTML =
      '<div class="page-head" style="margin-bottom:20px">' +
        '<div>' +
          '<div class="eyebrow" style="letter-spacing:0.06em">System &amp; Storefront</div>' +
          '<h1 style="font-size:26px;font-weight:700;letter-spacing:-0.03em">Settings</h1>' +
          '<div class="sub" style="font-size:13.5px;color:var(--ink-3)">Configure store dispatch logistics, storefront media, real-time alerts, and staff credentials.</div>' +
        '</div>' +
      '</div>' +

      // Segmented Tab Controls
      '<div class="settings-tabs-wrapper">' +
        '<div class="settings-tabs" role="tablist">' +
          '<button type="button" class="settings-tab-btn' + (initialTab === 'shipping' ? ' active' : '') + '" data-tab="shipping">' +
            icon('truck') + '<span>Store &amp; Shipping</span>' +
          '</button>' +
          '<button type="button" class="settings-tab-btn' + (initialTab === 'media' ? ' active' : '') + '" data-tab="media">' +
            icon('image') + '<span>Storefront Media</span>' +
          '</button>' +
          '<button type="button" class="settings-tab-btn' + (initialTab === 'alerts' ? ' active' : '') + '" data-tab="alerts">' +
            icon('bell') + '<span>Alerts &amp; Audio</span>' +
          '</button>' +
          '<button type="button" class="settings-tab-btn' + (initialTab === 'account' ? ' active' : '') + '" data-tab="account">' +
            icon('user') + '<span>Account &amp; Access</span>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // =========================================================================
      // TAB 1: STORE & SHIPPING
      // =========================================================================
      '<div id="pane-shipping" class="settings-tab-pane' + (initialTab === 'shipping' ? ' active' : '') + '">' +

        // Store "From Address" Panel
        '<div class="panel" style="margin-bottom:20px">' +
          '<div class="panel-head">' +
            '<h3>' + icon('map-pin') + 'Store Sender / Dispatch "From Address"</h3>' +
            '<span class="badge ok"><i class="d"></i>Order Slips &amp; Invoices</span>' +
          '</div>' +
          '<div class="panel-pad">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:18px;max-width:700px;line-height:1.5">' +
              'Configure the return and sender origin address for your store. This <b>From Address</b> is printed on <b>Courier Package Slips</b> and <b>Customer Tax Invoices</b>.' +
            '</p>' +

            '<div style="display:flex;flex-direction:column;gap:14px;max-width:680px">' +
              '<div class="grid grid-2" style="gap:14px">' +
                '<div class="field">' +
                  '<label>Store / Sender Name</label>' +
                  '<input class="input" id="faStoreName" value="' + esc(fromSettings.storeName || '') + '" placeholder="e.g. VANTRO">' +
                '</div>' +
                '<div class="field">' +
                  '<label>Dispatch Phone / Helpline</label>' +
                  '<input class="input" id="faPhone" value="' + esc(fromSettings.phone || '') + '" placeholder="e.g. +91 9400 123 456">' +
                '</div>' +
              '</div>' +

              '<div class="field">' +
                '<label>Complete Dispatch Address</label>' +
                '<textarea class="input" id="faAddress" rows="3" style="min-height:85px;line-height:1.5" placeholder="Enter complete dispatch address (Building, Street, City, State, PIN, Country)">' + esc(fromSettings.address || '') + '</textarea>' +
                '<span class="hint">Appears verbatim on printed courier labels and PDF customer invoices.</span>' +
              '</div>' +

              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap">' +
                '<button class="btn primary" id="btnSaveFromAddress">' + icon('check') + 'Save From Address</button>' +
                '<button class="btn ghost" id="btnResetFromAddress" style="color:var(--ink-3)">' + icon('refresh') + 'Reset Factory Defaults</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Delivery & Shipping Pricing Rules Panel
        '<div class="panel" style="margin-bottom:20px">' +
          '<div class="panel-head">' +
            '<h3>' + icon('truck') + 'Regional Delivery &amp; Shipping Rules</h3>' +
            '<span class="badge ok"><i class="d"></i>Kerala &amp; Rest of India</span>' +
          '</div>' +
          '<div class="panel-pad">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:20px;max-width:700px;line-height:1.5">' +
              'Automated courier delivery rates based on customer shipping state and pincode. Kerala orders enjoy free shipping; Rest of India rates apply automatically at checkout.' +
            '</p>' +

            '<div style="display:flex;flex-direction:column;gap:16px;max-width:680px">' +
              // Kerala Delivery Card
              '<div class="del-rule-card kerala">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
                  '<div>' +
                    '<div class="cell-strong" style="font-size:14.5px;display:flex;align-items:center;gap:8px">' +
                      'Kerala Deliveries' +
                      '<span class="badge ok" style="font-size:11px"><i class="d"></i>Always Free</span>' +
                    '</div>' +
                    '<div class="cell-sub" style="font-size:12px;margin-top:4px">' +
                      'All orders shipped to any district in Kerala automatically receive ₹0 Free Courier Delivery.' +
                    '</div>' +
                  '</div>' +
                  '<div style="font-weight:700;font-size:16px;color:var(--ok);letter-spacing:.02em">₹0 (FREE)</div>' +
                '</div>' +
              '</div>' +

              // Outside Kerala Card
              '<div class="del-rule-card outside">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
                  '<div class="cell-strong" style="font-size:14.5px">Outside Kerala (Rest of India)</div>' +
                  '<span class="badge info" style="font-size:11px">Configurable</span>' +
                '</div>' +
                '<div class="cell-sub" style="font-size:12px;margin-bottom:16px">' +
                  'Set minimum order value for free shipping, and delivery fee for orders below threshold.' +
                '</div>' +
                '<div class="grid grid-2" style="gap:14px">' +
                  '<div class="field">' +
                    '<label>Free Delivery Threshold (₹)</label>' +
                    '<input class="input" id="delOutsideMinOrder" type="number" min="0" step="1" value="' + esc(deliveryRules.outsideKeralaMinFreeOrder) + '" placeholder="e.g. 999">' +
                    '<span class="hint">Free shipping when cart item total is ≥ this amount.</span>' +
                  '</div>' +
                  '<div class="field">' +
                    '<label>Delivery Fee (₹)</label>' +
                    '<input class="input" id="delOutsideFee" type="number" min="0" step="1" value="' + esc(deliveryRules.outsideKeralaDeliveryFee) + '" placeholder="e.g. 50">' +
                    '<span class="hint">Applied only if order is under the free delivery threshold.</span>' +
                  '</div>' +
                '</div>' +
                '<div id="delRuleLiveSummary" style="margin-top:12px;padding:8px 12px;background:var(--graphite-2);border-radius:6px;font-size:12px;color:var(--ink-2)">' +
                  'Rule preview: Orders ≥ ₹' + esc(deliveryRules.outsideKeralaMinFreeOrder) + ' ship Free. Orders &lt; ₹' + esc(deliveryRules.outsideKeralaMinFreeOrder) + ' pay ₹' + esc(deliveryRules.outsideKeralaDeliveryFee) + '.' +
                '</div>' +
              '</div>' +

              // Actions
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:6px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap">' +
                '<button class="btn primary" id="btnSaveDeliveryRules">' + icon('check') + 'Save Delivery Rules</button>' +
                '<button class="btn ghost" id="btnResetDeliveryRules" style="color:var(--ink-3)">' + icon('refresh') + 'Reset Defaults (₹999 / ₹50)</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Storefront Domain URL Panel
        '<div class="panel">' +
          '<div class="panel-head">' +
            '<h3>' + icon('external') + 'Storefront Public URL &amp; Web Domain</h3>' +
            '<span class="badge neutral">Domain Link</span>' +
          '</div>' +
          '<div class="panel-pad">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:18px;max-width:700px;line-height:1.5">' +
              'The public domain used to generate shareable links, invoice QR codes, and customer track pages.' +
            '</p>' +
            '<div class="field" style="max-width:540px">' +
              '<label>Storefront Base URL</label>' +
              '<input class="input mono" id="sfPublicUrl" value="' + esc(CC.getStorefrontUrl()) + '" placeholder="e.g. https://vantroaccessories.in">' +
              '<span class="hint">Active resolution: <code>' + esc(CC.getStorefrontUrl()) + '</code></span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap">' +
              '<button class="btn primary" id="btnSaveStorefrontUrl">' + icon('check') + 'Save Storefront URL</button>' +
              '<button class="btn ghost" id="btnResetStorefrontUrl" style="color:var(--ink-3)">' + icon('refresh') + 'Auto-Detect</button>' +
              '<a href="' + esc(CC.getStorefrontUrl()) + '" target="_blank" rel="noopener" class="btn ghost" style="margin-left:auto">' + icon('external') + 'View Live Storefront</a>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // =========================================================================
      // TAB 2: STOREFRONT MULTIMEDIA & LOOKBOOK
      // =========================================================================
      '<div id="pane-media" class="settings-tab-pane' + (initialTab === 'media' ? ' active' : '') + '">' +

        // Hero Media Card
        '<div class="media-card">' +
          '<div class="media-card-head">' +
            '<div class="media-card-title">' + icon('image') + '<span>Homepage Hero Media</span></div>' +
            '<span id="heroStatusBadge" class="badge neutral"><i class="d"></i>Checking…</span>' +
          '</div>' +
          '<div class="media-card-body">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:16px;line-height:1.5">' +
              'High-impact hero video (.mp4, .webm) or photography (.webp, .jpg, .png) displayed in the homepage top banner. (Max 10MB)' +
            '</p>' +

            // Hero Live Preview Box
            '<div id="heroPreviewBox" class="media-preview-box" style="display:none">' +
              '<div class="media-live-badge"><i></i>Live on Storefront</div>' +
              '<div id="heroPreviewContent" style="width:100%;height:100%"></div>' +
              '<div class="media-preview-overlay">' +
                '<button type="button" class="btn sm" id="btnReplaceHero" style="background:rgba(0,0,0,0.75);color:#fff;border-color:rgba(255,255,255,0.2)">' + icon('upload') + 'Replace</button>' +
              '</div>' +
            '</div>' +

            // Hero Upload Dropzone
            '<div id="heroDropzone" class="upload-dropzone">' +
              '<div class="upload-dropzone-icon">' + icon('upload') + '</div>' +
              '<div class="upload-dropzone-title">Click to upload or drag &amp; drop Hero media</div>' +
              '<div class="upload-dropzone-sub">Supports MP4, WebM, WEBP, PNG, JPG (recommended 16:9 ratio, max 10MB)</div>' +
              '<input type="file" id="heroMediaInput" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" style="display:none">' +
            '</div>' +

            // Hero Staged File Banner
            '<div id="heroStagedBox" class="file-staged-box" style="display:none">' +
              '<div class="file-staged-meta">' +
                '<img id="heroStagedThumb" class="file-staged-thumb" src="" alt="Thumbnail" style="display:none">' +
                '<div>' +
                  '<div id="heroMediaName" class="file-staged-name">file.mp4</div>' +
                  '<div id="heroStagedSize" class="file-staged-size">0 MB</div>' +
                '</div>' +
              '</div>' +
              '<div class="file-staged-actions">' +
                '<button class="btn primary" id="btnUploadHeroMedia">' + icon('check') + 'Upload &amp; Save</button>' +
                '<button class="btn ghost sm" id="btnCancelHeroStaged" style="color:var(--ink-3)">Cancel</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Campaign Media Card
        '<div class="media-card">' +
          '<div class="media-card-head">' +
            '<div class="media-card-title">' + icon('image') + '<span>Homepage Campaign Slot Media</span></div>' +
            '<span id="campStatusBadge" class="badge neutral"><i class="d"></i>Checking…</span>' +
          '</div>' +
          '<div class="media-card-body">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:16px;line-height:1.5">' +
              'Promo campaign video or editorial artwork displayed in the featured campaign slot on the storefront homepage. (Max 10MB)' +
            '</p>' +

            // Campaign Live Preview Box
            '<div id="campPreviewBox" class="media-preview-box" style="display:none">' +
              '<div class="media-live-badge"><i></i>Live on Storefront</div>' +
              '<div id="campPreviewContent" style="width:100%;height:100%"></div>' +
              '<div class="media-preview-overlay">' +
                '<button type="button" class="btn sm" id="btnReplaceCamp" style="background:rgba(0,0,0,0.75);color:#fff;border-color:rgba(255,255,255,0.2)">' + icon('upload') + 'Replace</button>' +
              '</div>' +
            '</div>' +

            // Campaign Upload Dropzone
            '<div id="campDropzone" class="upload-dropzone">' +
              '<div class="upload-dropzone-icon">' + icon('upload') + '</div>' +
              '<div class="upload-dropzone-title">Click to upload or drag &amp; drop Campaign media</div>' +
              '<div class="upload-dropzone-sub">Supports MP4, WebM, WEBP, PNG, JPG (recommended 4:5 or 16:9 ratio)</div>' +
              '<input type="file" id="campaignMediaInput" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" style="display:none">' +
            '</div>' +

            // Campaign Staged File Banner
            '<div id="campStagedBox" class="file-staged-box" style="display:none">' +
              '<div class="file-staged-meta">' +
                '<img id="campStagedThumb" class="file-staged-thumb" src="" alt="Thumbnail" style="display:none">' +
                '<div>' +
                  '<div id="campaignMediaName" class="file-staged-name">file.jpg</div>' +
                  '<div id="campStagedSize" class="file-staged-size">0 MB</div>' +
                '</div>' +
              '</div>' +
              '<div class="file-staged-actions">' +
                '<button class="btn primary" id="btnUploadCampaignMedia">' + icon('check') + 'Upload &amp; Save</button>' +
                '<button class="btn ghost sm" id="btnCancelCampStaged" style="color:var(--ink-3)">Cancel</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Lookbook Slider ("AS SEEN ON 'YALL") Card
        '<div class="media-card">' +
          '<div class="media-card-head">' +
            '<div class="media-card-title">' +
              icon('layers') + '<span>Lookbook Showcase ("AS SEEN ON \'YALL")</span>' +
            '</div>' +
            '<span id="lbBadgeCount" class="badge ok"><i class="d"></i>Active Showcase</span>' +
          '</div>' +
          '<div class="media-card-body">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:18px;line-height:1.5">' +
              'Manage customer lifestyle photos and editorial lookbook cards displayed in the continuous auto-scrolling gallery on the storefront.' +
            '</p>' +

            // Lookbook Grid Container
            '<div id="lookbookPreviewGrid" class="lookbook-grid">' +
              UI.spinner() +
            '</div>' +

            '<input type="file" id="lookbookFileInput" accept="image/jpeg,image/png,image/webp" multiple style="display:none">' +

            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap">' +
              '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
                '<button class="btn primary" id="btnChooseLookbook">' + icon('upload') + 'Upload Photos</button>' +
                '<button class="btn ghost" id="btnResetLookbook" style="color:var(--ink-3)">' + icon('refresh') + 'Reset to Sample Gallery</button>' +
              '</div>' +
              '<span id="lookbookUploadStatus" class="cell-sub" style="font-size:12px;margin-left:auto"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Home Banner (between categories and best sellers)
        '<div class="media-card">' +
          '<div class="media-card-head">' +
            '<div class="media-card-title">' + icon('image') + '<span>Homepage Promo Banner</span></div>' +
            '<span id="homeBannerBadge" class="badge neutral"><i class="d"></i>Optional</span>' +
          '</div>' +
          '<div class="media-card-body">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:16px;line-height:1.5">' +
              'Full-width promotional banner shown between categories and Best Sellers. Recommended: 1500×400px. Leave empty to hide.' +
            '</p>' +

            // Home Banner Live Preview Box
            '<div id="homeBannerPreview" class="media-preview-box" style="display:none;max-height:200px">' +
              '<div class="media-live-badge"><i></i>Active Banner</div>' +
              '<img id="homeBannerImg" src="" alt="Current banner" style="max-height:200px">' +
              '<div class="media-preview-overlay">' +
                '<button type="button" class="btn danger sm" id="btnDeleteHomeBanner">' + icon('trash') + 'Remove</button>' +
              '</div>' +
            '</div>' +

            // Home Banner Dropzone
            '<div id="homeBannerDropzone" class="upload-dropzone">' +
              '<div class="upload-dropzone-icon">' + icon('upload') + '</div>' +
              '<div class="upload-dropzone-title">Click to upload or drag &amp; drop Promo Banner</div>' +
              '<div class="upload-dropzone-sub">High resolution panoramic banner (1500×400px recommended, max 10MB)</div>' +
              '<input type="file" id="homeBannerInput" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" style="display:none">' +
            '</div>' +

            // Home Banner Staged File Banner
            '<div id="bannerStagedBox" class="file-staged-box" style="display:none">' +
              '<div class="file-staged-meta">' +
                '<img id="bannerStagedThumb" class="file-staged-thumb" src="" alt="Thumbnail" style="display:none">' +
                '<div>' +
                  '<div id="homeBannerName" class="file-staged-name">banner.jpg</div>' +
                  '<div id="bannerStagedSize" class="file-staged-size">0 MB</div>' +
                '</div>' +
              '</div>' +
              '<div class="file-staged-actions">' +
                '<button class="btn primary" id="btnUploadHomeBanner">' + icon('check') + 'Upload &amp; Save</button>' +
                '<button class="btn ghost sm" id="btnCancelBannerStaged" style="color:var(--ink-3)">Cancel</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // =========================================================================
      // TAB 3: REAL-TIME ALERTS & AUDIO NOTIFICATIONS
      // =========================================================================
      '<div id="pane-alerts" class="settings-tab-pane' + (initialTab === 'alerts' ? ' active' : '') + '">' +

        // Push Notifications Status Panel
        '<div class="panel" style="margin-bottom:20px">' +
          '<div class="panel-head">' +
            '<h3>' + icon('bell') + 'Order Alerts &amp; Audio Dispatch</h3>' +
            '<span id="notifStatusBadge" class="badge neutral"><i class="d"></i>Checking…</span>' +
          '</div>' +
          '<div class="panel-pad">' +
            '<p class="cell-sub" style="font-size:13px;margin-bottom:20px;max-width:700px;line-height:1.5">' +
              'Receive instant audio and visual dispatch chimes when new customer orders are placed. Push alerts notify you even when this tab is minimized or backgrounded.' +
            '</p>' +

            '<div style="display:flex;flex-direction:column;gap:16px;max-width:680px">' +
              // Device Push Register Box
              '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--graphite-2);border:1px solid var(--line);border-radius:var(--r-md);flex-wrap:wrap;gap:14px">' +
                '<div>' +
                  '<div class="cell-strong" style="font-size:14.5px">Browser Push Notifications</div>' +
                  '<div class="cell-sub" id="notifStatusDesc" style="font-size:12px;margin-top:3px">' +
                    'Configure this browser to receive background order notifications' +
                  '</div>' +
                '</div>' +
                '<button class="btn primary" id="btnToggleNotifications">' + icon('zap') + 'Enable Notifications</button>' +
              '</div>' +

              // Audio & Popup Toggles
              '<div class="grid grid-2" style="gap:14px">' +
                // Visual Popup Alert
                '<div style="padding:16px;background:var(--graphite-2);border:1px solid var(--line);border-radius:var(--r-md)">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
                    '<span class="cell-strong" style="font-size:13.5px">Order Popup Alerts</span>' +
                    '<label class="switch-label">' +
                      '<input type="checkbox" class="switch-input" id="chkOrderAlerts"' + ((global.Notifications && global.Notifications.isOrderAlertsEnabled()) ? ' checked' : '') + '>' +
                      '<span class="switch-track"></span>' +
                    '</label>' +
                  '</div>' +
                  '<div class="cell-sub" style="font-size:12px">Display floating notification banners on top of the admin console.</div>' +
                '</div>' +

                // Audio Chime
                '<div style="padding:16px;background:var(--graphite-2);border:1px solid var(--line);border-radius:var(--r-md)">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
                    '<span class="cell-strong" style="font-size:13.5px">Order Chime Sound</span>' +
                    '<label class="switch-label">' +
                      '<input type="checkbox" class="switch-input" id="chkSoundAlerts"' + ((global.Notifications && global.Notifications.isSoundEnabled()) ? ' checked' : '') + '>' +
                      '<span class="switch-track"></span>' +
                    '</label>' +
                  '</div>' +
                  '<div class="cell-sub" style="font-size:12px">Play a high-frequency luxury chime sound on new orders.</div>' +
                '</div>' +
              '</div>' +

              // Volume Slider
              '<div style="padding:16px;background:var(--graphite-2);border:1px solid var(--line);border-radius:var(--r-md)">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
                  '<span class="cell-strong" style="font-size:13.5px">Chime Sound Volume</span>' +
                  '<span id="volLabel" class="badge neutral" style="font-size:11px">' + Math.round((global.Notifications ? global.Notifications.getSoundVolume() : 0.8) * 100) + '%</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px">' +
                  icon('volume', 'ic') +
                  '<input type="range" id="rngVolume" min="0" max="1" step="0.05" value="' + (global.Notifications ? global.Notifications.getSoundVolume() : 0.8) + '" style="flex:1;cursor:pointer;accent-color:var(--ink)">' +
                '</div>' +
              '</div>' +

              // Test Buttons Toolbar
              '<div style="display:flex;align-items:center;gap:12px;padding-top:4px;flex-wrap:wrap">' +
                '<button class="btn ghost" id="btnTestSound">' + icon('volume') + 'Test Order Chime</button>' +
                '<button class="btn ghost" id="btnTestNotif">' + icon('bell') + 'Send Test Push Alert</button>' +
              '</div>' +

              // Web Push VAPID Key Section
              '<div style="padding-top:16px;border-top:1px solid var(--line)">' +
                '<div class="field">' +
                  '<label style="font-size:12.5px;color:var(--ink-2)">Firebase Web Push Certificate (VAPID Key Pair)</label>' +
                  '<div style="display:flex;gap:10px">' +
                    '<input class="input mono" id="txtVapidKey" style="font-size:12px" value="' + esc(localStorage.getItem('vantro_vapid_key') || (global.FIREBASE_WEB_CONFIG && global.FIREBASE_WEB_CONFIG.vapidKey) || '') + '" placeholder="Paste public VAPID key pair from Firebase Console">' +
                    '<button class="btn ghost" id="btnSaveVapid" style="flex:none">' + icon('check') + 'Save Key</button>' +
                  '</div>' +
                  '<span class="hint">Location: Firebase Console → Project Settings → Cloud Messaging → Web configuration.</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // =========================================================================
      // TAB 4: ACCOUNT & TEAM ACCESS
      // =========================================================================
      '<div id="pane-account" class="settings-tab-pane' + (initialTab === 'account' ? ' active' : '') + '">' +

        '<div class="grid grid-2" style="margin-bottom:20px;gap:16px">' +
          // Admin Profile Card
          '<div class="panel">' +
            '<div class="panel-head"><h3>' + icon('user') + 'Admin Identity</h3></div>' +
            '<div class="panel-pad">' +
              '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">' +
                '<div class="avatar" style="width:62px;height:62px;font-size:24px;border-radius:18px;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:700">' + esc(initial) + '</div>' +
                '<div>' +
                  '<div class="cell-strong" style="font-size:17px">' + esc(name) + '</div>' +
                  '<div class="cell-sub" style="font-size:13px">' + esc(info.email || 'admin@vantro.in') + '</div>' +
                  '<span class="badge violet" style="margin-top:6px">' + esc(role) + '</span>' +
                '</div>' +
              '</div>' +
              '<dl class="kv">' +
                '<dt>Admin ID</dt><dd class="mono">' + esc(info._id || '—') + '</dd>' +
                '<dt>Role Scope</dt><dd>' + esc(role) + '</dd>' +
                '<dt>Console Session</dt><dd class="badge ok" style="padding:2px 8px;font-size:11px"><i class="d"></i>Active</dd>' +
              '</dl>' +
            '</div>' +
          '</div>' +

          // Session & System Controls
          '<div style="display:flex;flex-direction:column;gap:16px">' +
            '<div class="panel">' +
              '<div class="panel-head"><h3>' + icon('shield') + 'Session Security</h3></div>' +
              '<div class="panel-pad">' +
                '<p class="cell-sub" style="font-size:13px;margin-bottom:16px;line-height:1.5">' +
                  'Admin credentials remain authenticated for 30 days. Sign out to revoke console access on this browser.' +
                '</p>' +
                '<button class="btn danger" id="logoutBtn">' + icon('log-out') + 'Sign Out of Console</button>' +
              '</div>' +
            '</div>' +

            '<div class="panel">' +
              '<div class="panel-head"><h3>' + icon('command') + 'System Telemetry</h3></div>' +
              '<div class="panel-pad">' +
                '<dl class="kv">' +
                  '<dt>Console</dt><dd>Vantro Command Center</dd>' +
                  '<dt>API Endpoint</dt><dd class="mono" style="font-size:12px">' + esc(CC.API.base) + '</dd>' +
                  '<dt>Framework</dt><dd>Buildless · Luxury Engine v1</dd>' +
                '</dl>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Team Management (super-admin only)
        (isSuper ?
          '<div class="panel">' +
            '<div class="panel-head">' +
              '<h3>' + icon('users') + 'Add Team Member</h3>' +
              '<span class="badge violet">Super Admin Access</span>' +
            '</div>' +
            '<div class="panel-pad">' +
              '<p class="cell-sub" style="font-size:13px;margin-bottom:18px;max-width:680px">' +
                'Provision new team member access to manage store orders, stock inventory, and analytics.' +
              '</p>' +
              '<div class="grid grid-2" style="gap:14px;max-width:680px">' +
                '<div class="field"><label>Full Name</label><input class="input" id="tmName" placeholder="e.g. John Doe"></div>' +
                '<div class="field"><label>Email Address</label><input class="input" id="tmEmail" type="email" placeholder="name@vantro.in"></div>' +
                '<div class="field"><label>Temporary Password</label><input class="input" id="tmPass" type="password" placeholder="Min 6 characters"></div>' +
                '<div class="field"><label>Role Authority</label><select class="select" id="tmRole">' +
                  '<option value="admin">Admin (Standard)</option>' +
                  '<option value="super admin">Super Admin (Full Root Access)</option>' +
                '</select></div>' +
              '</div>' +
              '<button class="btn primary" id="addMember" style="margin-top:16px">' + icon('plus') + 'Create Team Member</button>' +
            '</div>' +
          '</div>' : '') +

      '</div>';

    // =========================================================================
    // TAB SWITCHING HANDLER
    // =========================================================================
    var tabBtns = root.querySelectorAll('.settings-tab-btn');
    var tabPanes = root.querySelectorAll('.settings-tab-pane');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = this.getAttribute('data-tab');
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        tabPanes.forEach(function (p) { p.classList.remove('active'); });

        this.classList.add('active');
        var pane = root.querySelector('#pane-' + targetTab);
        if (pane) pane.classList.add('active');

        try { localStorage.setItem(activeTabKey, targetTab); } catch (e) {}
      });
    });

    // =========================================================================
    // STORE & SHIPPING: FROM ADDRESS HANDLERS
    // =========================================================================
    var btnSaveFA = root.querySelector('#btnSaveFromAddress');
    if (btnSaveFA) {
      btnSaveFA.addEventListener('click', function () {
        var storeName = (root.querySelector('#faStoreName').value || '').trim();
        var phone = (root.querySelector('#faPhone').value || '').trim();
        var address = (root.querySelector('#faAddress').value || '').trim();

        if (!storeName) {
          CC.toast('Store / Sender name is required', 'bad');
          return;
        }
        if (!address) {
          CC.toast('From Address is required', 'bad');
          return;
        }

        btnSaveFA.disabled = true;
        try {
          if (global.Invoice && global.Invoice.saveFromSettings) {
            global.Invoice.saveFromSettings({
              storeName: storeName,
              phone: phone,
              address: address
            });
          }
          CC.toast('From Address saved! Printed on all courier slips & invoices.', 'ok');
        } catch (e) {
          CC.toast('Failed to save settings: ' + e.message, 'bad');
        } finally {
          setTimeout(function () { btnSaveFA.disabled = false; }, 400);
        }
      });
    }

    var btnResetFA = root.querySelector('#btnResetFromAddress');
    if (btnResetFA) {
      btnResetFA.addEventListener('click', function () {
        CC.confirmModal({
          title: 'Reset From Address?',
          body: 'This will revert the dispatch From Address to original factory defaults.',
          ok: 'Reset',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          if (global.Invoice && global.Invoice.resetFromSettings) {
            var def = global.Invoice.resetFromSettings();
            root.querySelector('#faStoreName').value = def.storeName || '';
            root.querySelector('#faPhone').value = def.phone || '';
            root.querySelector('#faAddress').value = def.address || '';
            CC.toast('From Address reset to factory defaults.', 'ok');
          }
        });
      });
    }

    // =========================================================================
    // STORE & SHIPPING: DELIVERY RULES HANDLERS
    // =========================================================================
    var minInp = root.querySelector('#delOutsideMinOrder');
    var feeInp = root.querySelector('#delOutsideFee');
    var liveSummary = root.querySelector('#delRuleLiveSummary');

    function updateRuleSummary() {
      if (!liveSummary) return;
      var m = minInp ? minInp.value : '999';
      var f = feeInp ? feeInp.value : '50';
      liveSummary.textContent = 'Rule preview: Orders ≥ ₹' + m + ' ship Free. Orders < ₹' + m + ' pay ₹' + f + ' delivery charge.';
    }

    if (minInp) minInp.addEventListener('input', updateRuleSummary);
    if (feeInp) feeInp.addEventListener('input', updateRuleSummary);

    // Fetch live delivery rules from server
    CC.API.get('/admin/settings/delivery_rules').then(function (res) {
      if (res && res.value && typeof res.value === 'object') {
        var val = res.value;
        if (minInp && val.outsideKeralaMinFreeOrder !== undefined) minInp.value = val.outsideKeralaMinFreeOrder;
        if (feeInp && val.outsideKeralaDeliveryFee !== undefined) feeInp.value = val.outsideKeralaDeliveryFee;
        try { localStorage.setItem('vantro_delivery_rules', JSON.stringify(val)); } catch (e) {}
        updateRuleSummary();
      }
    }).catch(function (e) {
      console.warn('Could not fetch delivery rules:', e.message);
    });

    var btnSaveDR = root.querySelector('#btnSaveDeliveryRules');
    if (btnSaveDR) {
      btnSaveDR.addEventListener('click', function () {
        var minVal = parseInt(minInp ? minInp.value : '999', 10);
        var feeVal = parseInt(feeInp ? feeInp.value : '50', 10);

        if (isNaN(minVal) || minVal < 0) {
          CC.toast('Enter a valid free delivery threshold (>= 0)', 'bad');
          return;
        }
        if (isNaN(feeVal) || feeVal < 0) {
          CC.toast('Enter a valid delivery fee (>= 0)', 'bad');
          return;
        }

        btnSaveDR.disabled = true;
        var payload = {
          keralaDeliveryFee: 0,
          outsideKeralaMinFreeOrder: minVal,
          outsideKeralaDeliveryFee: feeVal
        };

        CC.API.put('/admin/settings/delivery_rules', { value: payload })
          .then(function () {
            try { localStorage.setItem('vantro_delivery_rules', JSON.stringify(payload)); } catch (e) {}
            CC.toast('Delivery rules saved! Kerala is Free; Rest of India threshold is ₹' + minVal + ' (Fee: ₹' + feeVal + ').', 'ok');
          })
          .catch(function (err) {
            CC.toast('Failed to save delivery rules: ' + (err.message || 'Error'), 'bad');
          })
          .finally(function () {
            setTimeout(function () { btnSaveDR.disabled = false; }, 400);
          });
      });
    }

    var btnResetDR = root.querySelector('#btnResetDeliveryRules');
    if (btnResetDR) {
      btnResetDR.addEventListener('click', function () {
        CC.confirmModal({
          title: 'Reset Delivery Rules?',
          body: 'This will revert outside Kerala rules to factory defaults: Free over ₹999, and ₹50 delivery fee under ₹999. Kerala remains ₹0 free delivery.',
          ok: 'Reset Rules',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          var payload = {
            keralaDeliveryFee: 0,
            outsideKeralaMinFreeOrder: 999,
            outsideKeralaDeliveryFee: 50
          };
          if (minInp) minInp.value = 999;
          if (feeInp) feeInp.value = 50;
          updateRuleSummary();

          CC.API.put('/admin/settings/delivery_rules', { value: payload })
            .then(function () {
              try { localStorage.setItem('vantro_delivery_rules', JSON.stringify(payload)); } catch (e) {}
              CC.toast('Delivery rules reset to defaults (₹999 / ₹50).', 'ok');
            })
            .catch(function (err) {
              CC.toast('Failed to reset delivery rules: ' + (err.message || 'Error'), 'bad');
            });
        });
      });
    }

    // Storefront URL logic
    var btnSaveSf = root.querySelector('#btnSaveStorefrontUrl');
    var btnResetSf = root.querySelector('#btnResetStorefrontUrl');
    var sfInput = root.querySelector('#sfPublicUrl');
    if (btnSaveSf && sfInput) {
      btnSaveSf.addEventListener('click', function () {
        var val = (sfInput.value || '').trim();
        if (!val) {
          localStorage.removeItem('vantro_storefront_url');
          sfInput.value = CC.getStorefrontUrl();
          CC.toast('Storefront URL set to auto-detect: ' + CC.getStorefrontUrl(), 'ok');
        } else {
          localStorage.setItem('vantro_storefront_url', val.replace(/\/+$/, ''));
          CC.toast('Storefront URL saved!', 'ok');
        }
      });
    }
    if (btnResetSf && sfInput) {
      btnResetSf.addEventListener('click', function () {
        localStorage.removeItem('vantro_storefront_url');
        sfInput.value = CC.getStorefrontUrl();
        CC.toast('Reverted to auto-detected URL: ' + sfInput.value, 'ok');
      });
    }

    // =========================================================================
    // STOREFRONT MEDIA: HERO MEDIA HANDLERS
    // =========================================================================
    var heroDropzone = root.querySelector('#heroDropzone');
    var heroInput = root.querySelector('#heroMediaInput');
    var heroName = root.querySelector('#heroMediaName');
    var heroBtn = root.querySelector('#btnUploadHeroMedia');
    var heroStagedBox = root.querySelector('#heroStagedBox');
    var heroStagedSize = root.querySelector('#heroStagedSize');
    var heroStagedThumb = root.querySelector('#heroStagedThumb');
    var btnCancelHero = root.querySelector('#btnCancelHeroStaged');
    var heroPreviewBox = root.querySelector('#heroPreviewBox');
    var heroPreviewContent = root.querySelector('#heroPreviewContent');
    var heroStatusBadge = root.querySelector('#heroStatusBadge');
    var btnReplaceHero = root.querySelector('#btnReplaceHero');

    function renderHeroLiveMedia(url) {
      if (!url) {
        if (heroPreviewBox) heroPreviewBox.style.display = 'none';
        if (heroStatusBadge) {
          heroStatusBadge.className = 'badge neutral';
          heroStatusBadge.innerHTML = '<i class="d"></i>No media set';
        }
        return;
      }
      var isVideo = /\.(mp4|webm|mov)$/i.test(url) || url.includes('/video/upload/');
      if (heroPreviewContent) {
        if (isVideo) {
          heroPreviewContent.innerHTML = '<video src="' + esc(url) + '" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;max-height:280px"></video>';
        } else {
          heroPreviewContent.innerHTML = '<img src="' + esc(url) + '" style="width:100%;height:100%;object-fit:cover;max-height:280px" alt="Hero media">';
        }
      }
      if (heroPreviewBox) heroPreviewBox.style.display = 'flex';
      if (heroStatusBadge) {
        heroStatusBadge.className = 'badge ok';
        heroStatusBadge.innerHTML = '<i class="d"></i>' + (isVideo ? 'Video' : 'Image') + ' active';
      }
    }

    // Load active hero media from server
    CC.API.get('/settings/hero_media').then(function (res) {
      var url = res && (res.value || (res.setting && res.setting.value));
      renderHeroLiveMedia(url);
    }).catch(function () {
      if (heroStatusBadge) {
        heroStatusBadge.className = 'badge neutral';
        heroStatusBadge.innerHTML = '<i class="d"></i>Not configured';
      }
    });

    if (heroDropzone && heroInput) {
      heroDropzone.addEventListener('click', function () { heroInput.click(); });
      heroDropzone.addEventListener('dragover', function (e) { e.preventDefault(); heroDropzone.classList.add('drag-over'); });
      heroDropzone.addEventListener('dragleave', function () { heroDropzone.classList.remove('drag-over'); });
      heroDropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        heroDropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          heroInput.files = e.dataTransfer.files;
          triggerHeroStage(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnReplaceHero && heroInput) {
      btnReplaceHero.addEventListener('click', function () { heroInput.click(); });
    }

    function triggerHeroStage(file) {
      if (!file) return;
      heroName.textContent = file.name;
      heroStagedSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (file.type.startsWith('image/')) {
        heroStagedThumb.src = URL.createObjectURL(file);
        heroStagedThumb.style.display = 'block';
      } else {
        heroStagedThumb.style.display = 'none';
      }
      heroStagedBox.style.display = 'flex';
    }

    if (heroInput) {
      heroInput.addEventListener('change', function () {
        if (this.files && this.files[0]) triggerHeroStage(this.files[0]);
      });
    }

    if (btnCancelHero) {
      btnCancelHero.addEventListener('click', function () {
        heroInput.value = '';
        heroStagedBox.style.display = 'none';
      });
    }

    if (heroBtn && heroInput) {
      heroBtn.addEventListener('click', function () {
        var file = heroInput.files[0];
        if (!file) return;
        heroBtn.disabled = true;
        heroBtn.innerHTML = UI.spinner() + ' Uploading…';

        CC.API.upload(file)
          .then(function (url) {
            return CC.API.put('/settings/hero_media', { value: url }).then(function () { return url; });
          })
          .then(function (url) {
            CC.toast('Hero media updated successfully!', 'ok');
            renderHeroLiveMedia(url);
            heroInput.value = '';
            heroStagedBox.style.display = 'none';
          })
          .catch(function (e) {
            CC.toast(e.message || 'Upload failed', 'bad');
          })
          .finally(function () {
            heroBtn.disabled = false;
            heroBtn.innerHTML = icon('check') + 'Upload &amp; Save';
          });
      });
    }

    // =========================================================================
    // STOREFRONT MEDIA: CAMPAIGN MEDIA HANDLERS
    // =========================================================================
    var campDropzone = root.querySelector('#campDropzone');
    var campInput = root.querySelector('#campaignMediaInput');
    var campName = root.querySelector('#campaignMediaName');
    var campBtn = root.querySelector('#btnUploadCampaignMedia');
    var campStagedBox = root.querySelector('#campStagedBox');
    var campStagedSize = root.querySelector('#campStagedSize');
    var campStagedThumb = root.querySelector('#campStagedThumb');
    var btnCancelCamp = root.querySelector('#btnCancelCampStaged');
    var campPreviewBox = root.querySelector('#campPreviewBox');
    var campPreviewContent = root.querySelector('#campPreviewContent');
    var campStatusBadge = root.querySelector('#campStatusBadge');
    var btnReplaceCamp = root.querySelector('#btnReplaceCamp');

    function renderCampLiveMedia(url) {
      if (!url) {
        if (campPreviewBox) campPreviewBox.style.display = 'none';
        if (campStatusBadge) {
          campStatusBadge.className = 'badge neutral';
          campStatusBadge.innerHTML = '<i class="d"></i>No media set';
        }
        return;
      }
      var isVideo = /\.(mp4|webm|mov)$/i.test(url) || url.includes('/video/upload/');
      if (campPreviewContent) {
        if (isVideo) {
          campPreviewContent.innerHTML = '<video src="' + esc(url) + '" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;max-height:280px"></video>';
        } else {
          campPreviewContent.innerHTML = '<img src="' + esc(url) + '" style="width:100%;height:100%;object-fit:cover;max-height:280px" alt="Campaign media">';
        }
      }
      if (campPreviewBox) campPreviewBox.style.display = 'flex';
      if (campStatusBadge) {
        campStatusBadge.className = 'badge ok';
        campStatusBadge.innerHTML = '<i class="d"></i>' + (isVideo ? 'Video' : 'Image') + ' active';
      }
    }

    CC.API.get('/settings/campaign_media').then(function (res) {
      var url = res && (res.value || (res.setting && res.setting.value));
      renderCampLiveMedia(url);
    }).catch(function () {
      if (campStatusBadge) {
        campStatusBadge.className = 'badge neutral';
        campStatusBadge.innerHTML = '<i class="d"></i>Not configured';
      }
    });

    if (campDropzone && campInput) {
      campDropzone.addEventListener('click', function () { campInput.click(); });
      campDropzone.addEventListener('dragover', function (e) { e.preventDefault(); campDropzone.classList.add('drag-over'); });
      campDropzone.addEventListener('dragleave', function () { campDropzone.classList.remove('drag-over'); });
      campDropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        campDropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          campInput.files = e.dataTransfer.files;
          triggerCampStage(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnReplaceCamp && campInput) {
      btnReplaceCamp.addEventListener('click', function () { campInput.click(); });
    }

    function triggerCampStage(file) {
      if (!file) return;
      campName.textContent = file.name;
      campStagedSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (file.type.startsWith('image/')) {
        campStagedThumb.src = URL.createObjectURL(file);
        campStagedThumb.style.display = 'block';
      } else {
        campStagedThumb.style.display = 'none';
      }
      campStagedBox.style.display = 'flex';
    }

    if (campInput) {
      campInput.addEventListener('change', function () {
        if (this.files && this.files[0]) triggerCampStage(this.files[0]);
      });
    }

    if (btnCancelCamp) {
      btnCancelCamp.addEventListener('click', function () {
        campInput.value = '';
        campStagedBox.style.display = 'none';
      });
    }

    if (campBtn && campInput) {
      campBtn.addEventListener('click', function () {
        var file = campInput.files[0];
        if (!file) return;
        campBtn.disabled = true;
        campBtn.innerHTML = UI.spinner() + ' Uploading…';

        CC.API.upload(file)
          .then(function (url) {
            return CC.API.put('/settings/campaign_media', { value: url }).then(function () { return url; });
          })
          .then(function (url) {
            CC.toast('Campaign media updated successfully!', 'ok');
            renderCampLiveMedia(url);
            campInput.value = '';
            campStagedBox.style.display = 'none';
          })
          .catch(function (e) {
            CC.toast(e.message || 'Upload failed', 'bad');
          })
          .finally(function () {
            campBtn.disabled = false;
            campBtn.innerHTML = icon('check') + 'Upload &amp; Save';
          });
      });
    }

    // =========================================================================
    // STOREFRONT MEDIA: LOOKBOOK SLIDER HANDLERS (FIX BROKEN IMAGES)
    // =========================================================================
    var lookbookGrid = root.querySelector('#lookbookPreviewGrid');
    var lookbookInput = root.querySelector('#lookbookFileInput');
    var btnChooseLb = root.querySelector('#btnChooseLookbook');
    var btnResetLb = root.querySelector('#btnResetLookbook');
    var lbStatus = root.querySelector('#lookbookUploadStatus');
    var lbBadgeCount = root.querySelector('#lbBadgeCount');
    var currentLookbook = [];

    // Curated high-res fashion lifestyle sample photos if user chooses to reset defaults
    var curatedLookbookSamples = [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80'
    ];

    function sanitizeLookbookUrls(arr) {
      if (!Array.isArray(arr)) return [];
      // Filter out invalid local /assets/lookbook/... paths that return 404
      return arr.filter(function (url) {
        if (!url || typeof url !== 'string') return false;
        var trimmed = url.trim();
        if (trimmed.startsWith('/assets/lookbook/')) return false; // purge broken relative paths
        return trimmed.length > 5;
      });
    }

    function renderLookbookImages(imgs) {
      if (!lookbookGrid) return;

      var validImgs = sanitizeLookbookUrls(imgs);
      currentLookbook = validImgs;

      if (lbBadgeCount) {
        lbBadgeCount.innerHTML = '<i class="d"></i>' + validImgs.length + ' Photos Active';
      }

      if (!validImgs.length) {
        lookbookGrid.innerHTML =
          '<div style="grid-column:1/-1;padding:28px 20px;text-align:center;background:var(--graphite-2);border:1px dashed var(--line);border-radius:var(--r-md);color:var(--ink-2)">' +
            '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px">No Lookbook photos uploaded yet</div>' +
            '<div style="font-size:12.5px;color:var(--ink-3);max-width:440px;margin:0 auto 16px;line-height:1.5">' +
              'Showcase your customers and models on the storefront homepage under the "AS SEEN ON \'YALL" carousel.' +
            '</div>' +
            '<button type="button" class="btn primary sm" id="btnLbEmptyAdd">' + icon('upload') + 'Upload Photos</button>' +
          '</div>';

        var emptyAdd = lookbookGrid.querySelector('#btnLbEmptyAdd');
        if (emptyAdd && lookbookInput) {
          emptyAdd.addEventListener('click', function () { lookbookInput.click(); });
        }
        return;
      }

      var html = validImgs.map(function (url, idx) {
        return '<div class="lookbook-item">' +
          '<img src="' + esc(url) + '" loading="lazy" alt="Lookbook ' + (idx + 1) + '" onerror="this.parentElement.style.opacity=\'0.3\'">' +
          '<button type="button" class="lookbook-del-btn" data-idx="' + idx + '" title="Remove photo">' +
            icon('x') +
          '</button>' +
        '</div>';
      }).join('');

      // Add one-click "+ Add Photo" dashed tile at the end of the grid
      html += '<div class="lookbook-add-tile" id="lbAddTile" title="Add another lookbook photo">' +
        icon('plus') +
        '<span style="font-size:11px;font-weight:600">Add Photo</span>' +
      '</div>';

      lookbookGrid.innerHTML = html;

      // Attach delete handlers
      lookbookGrid.querySelectorAll('.lookbook-del-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var idx = parseInt(this.getAttribute('data-idx'), 10);
          currentLookbook.splice(idx, 1);
          saveLookbook(currentLookbook);
        });
      });

      // Attach add tile handler
      var addTile = lookbookGrid.querySelector('#lbAddTile');
      if (addTile && lookbookInput) {
        addTile.addEventListener('click', function () { lookbookInput.click(); });
      }
    }

    function saveLookbook(imgs) {
      if (lbStatus) lbStatus.textContent = 'Saving gallery…';
      CC.API.put('/settings/lookbook_slider', { value: imgs }).then(function () {
        CC.toast('Lookbook showcase updated successfully!', 'ok');
        if (lbStatus) lbStatus.textContent = imgs.length + ' photo' + (imgs.length === 1 ? '' : 's') + ' live on storefront';
        renderLookbookImages(imgs);
      }).catch(function (err) {
        CC.toast(err.message || 'Failed to save lookbook', 'bad');
        if (lbStatus) lbStatus.textContent = 'Error saving';
      });
    }

    // Fetch lookbook slider from server
    CC.API.get('/settings/lookbook_slider').then(function (res) {
      var val = (res && res.value && (Array.isArray(res.value) ? res.value : res.value.images)) || [];
      var clean = sanitizeLookbookUrls(val);
      renderLookbookImages(clean);
      if (lbStatus) lbStatus.textContent = clean.length + ' photos configured';
    }).catch(function () {
      renderLookbookImages([]);
    });

    if (btnChooseLb && lookbookInput) {
      btnChooseLb.addEventListener('click', function () { lookbookInput.click(); });
    }

    if (lookbookInput) {
      lookbookInput.addEventListener('change', function () {
        var files = Array.from(this.files || []);
        if (!files.length) return;
        btnChooseLb.disabled = true;
        btnChooseLb.innerHTML = UI.spinner() + ' Uploading (' + files.length + ')…';
        if (lbStatus) lbStatus.textContent = 'Uploading ' + files.length + ' photos…';

        var uploadedUrls = [];
        var p = Promise.resolve();
        files.forEach(function (f) {
          p = p.then(function () {
            return CC.API.upload(f).then(function (url) {
              if (url) uploadedUrls.push(url);
            });
          });
        });

        p.then(function () {
          currentLookbook = currentLookbook.concat(uploadedUrls);
          saveLookbook(currentLookbook);
          CC.toast('Uploaded ' + uploadedUrls.length + ' photos successfully!', 'ok');
        }).catch(function (err) {
          CC.toast(err.message || 'Upload failed', 'bad');
        }).finally(function () {
          btnChooseLb.disabled = false;
          btnChooseLb.innerHTML = icon('upload') + 'Upload Photos';
          lookbookInput.value = '';
        });
      });
    }

    if (btnResetLb) {
      btnResetLb.addEventListener('click', function () {
        CC.confirmModal({
          title: 'Load Curated Sample Gallery?',
          body: 'This will replace your current lookbook slider with 5 clean luxury fashion sample photos.',
          ok: 'Load Samples',
          danger: false
        }).then(function (ok) {
          if (!ok) return;
          saveLookbook(curatedLookbookSamples.slice());
        });
      });
    }

    // =========================================================================
    // STOREFRONT MEDIA: HOME PROMO BANNER HANDLERS
    // =========================================================================
    var bannerDropzone = root.querySelector('#homeBannerDropzone');
    var bannerInput = root.querySelector('#homeBannerInput');
    var bannerName = root.querySelector('#homeBannerName');
    var bannerBtn = root.querySelector('#btnUploadHomeBanner');
    var bannerDelBtn = root.querySelector('#btnDeleteHomeBanner');
    var bannerPreview = root.querySelector('#homeBannerPreview');
    var bannerImg = root.querySelector('#homeBannerImg');
    var bannerStagedBox = root.querySelector('#bannerStagedBox');
    var bannerStagedThumb = root.querySelector('#bannerStagedThumb');
    var bannerStagedSize = root.querySelector('#bannerStagedSize');
    var btnCancelBanner = root.querySelector('#btnCancelBannerStaged');
    var homeBannerBadge = root.querySelector('#homeBannerBadge');

    function renderHomeBanner(url) {
      if (url && bannerPreview && bannerImg) {
        bannerImg.src = url;
        bannerPreview.style.display = 'flex';
        if (homeBannerBadge) {
          homeBannerBadge.className = 'badge ok';
          homeBannerBadge.innerHTML = '<i class="d"></i>Banner active';
        }
      } else {
        if (bannerPreview) bannerPreview.style.display = 'none';
        if (homeBannerBadge) {
          homeBannerBadge.className = 'badge neutral';
          homeBannerBadge.innerHTML = '<i class="d"></i>No banner active';
        }
      }
    }

    CC.API.get('/settings/home_banner').then(function (res) {
      var url = res && res.value;
      renderHomeBanner(url);
    }).catch(function () {});

    if (bannerDropzone && bannerInput) {
      bannerDropzone.addEventListener('click', function () { bannerInput.click(); });
      bannerDropzone.addEventListener('dragover', function (e) { e.preventDefault(); bannerDropzone.classList.add('drag-over'); });
      bannerDropzone.addEventListener('dragleave', function () { bannerDropzone.classList.remove('drag-over'); });
      bannerDropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        bannerDropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          bannerInput.files = e.dataTransfer.files;
          triggerBannerStage(e.dataTransfer.files[0]);
        }
      });
    }

    function triggerBannerStage(file) {
      if (!file) return;
      bannerName.textContent = file.name;
      bannerStagedSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (file.type.startsWith('image/')) {
        bannerStagedThumb.src = URL.createObjectURL(file);
        bannerStagedThumb.style.display = 'block';
      } else {
        bannerStagedThumb.style.display = 'none';
      }
      bannerStagedBox.style.display = 'flex';
    }

    if (bannerInput) {
      bannerInput.addEventListener('change', function () {
        if (this.files && this.files[0]) triggerBannerStage(this.files[0]);
      });
    }

    if (btnCancelBanner) {
      btnCancelBanner.addEventListener('click', function () {
        bannerInput.value = '';
        bannerStagedBox.style.display = 'none';
      });
    }

    if (bannerBtn && bannerInput) {
      bannerBtn.addEventListener('click', function () {
        var file = bannerInput.files[0];
        if (!file) return;
        bannerBtn.disabled = true;
        bannerBtn.innerHTML = UI.spinner() + ' Uploading…';

        CC.API.upload(file)
          .then(function (url) {
            return CC.API.put('/settings/home_banner', { value: url }).then(function () { return url; });
          })
          .then(function (url) {
            CC.toast('Home banner updated successfully!', 'ok');
            renderHomeBanner(url);
            bannerInput.value = '';
            bannerStagedBox.style.display = 'none';
          })
          .catch(function (e) {
            CC.toast(e.message || 'Upload failed', 'bad');
          })
          .finally(function () {
            bannerBtn.disabled = false;
            bannerBtn.innerHTML = icon('check') + 'Upload &amp; Save';
          });
      });
    }

    if (bannerDelBtn) {
      bannerDelBtn.addEventListener('click', function () {
        CC.confirmModal({
          title: 'Remove Home Banner?',
          body: 'This will remove the category promo banner from your storefront homepage.',
          ok: 'Remove Banner',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          bannerDelBtn.disabled = true;
          CC.API.put('/settings/home_banner', { value: '' })
            .then(function () {
              CC.toast('Home banner removed', 'ok');
              renderHomeBanner('');
            })
            .catch(function (e) { CC.toast(e.message || 'Failed', 'bad'); })
            .finally(function () { bannerDelBtn.disabled = false; });
        });
      });
    }

    // =========================================================================
    // ALERTS & NOTIFICATIONS HANDLERS
    // =========================================================================
    var btnToggleNotif = root.querySelector('#btnToggleNotifications');
    var badgeNotif = root.querySelector('#notifStatusBadge');
    var descNotif = root.querySelector('#notifStatusDesc');
    var chkAlerts = root.querySelector('#chkOrderAlerts');
    var chkSound = root.querySelector('#chkSoundAlerts');
    var rngVol = root.querySelector('#rngVolume');
    var volLabel = root.querySelector('#volLabel');
    var btnTestN = root.querySelector('#btnTestNotif');
    var btnTestS = root.querySelector('#btnTestSound');

    function updateNotifUI() {
      if (!global.Notifications) return;
      var status = global.Notifications.getPermissionStatus();
      var enabled = global.Notifications.isEnabled();

      if (status === 'granted' && enabled) {
        badgeNotif.className = 'badge ok';
        badgeNotif.innerHTML = '<i class="d"></i>Notifications active';
        descNotif.textContent = 'This browser is actively registered to receive real-time order alerts.';
        btnToggleNotif.innerHTML = icon('check') + 'Active (Re-register)';
        btnToggleNotif.className = 'btn ghost';
        btnToggleNotif.disabled = false;
      } else if (status === 'granted') {
        badgeNotif.className = 'badge ok';
        badgeNotif.innerHTML = '<i class="d"></i>Permission granted';
        descNotif.textContent = 'Browser permission granted. Click below to activate registration.';
        btnToggleNotif.innerHTML = icon('zap') + 'Register Device';
        btnToggleNotif.className = 'btn primary';
        btnToggleNotif.disabled = false;
      } else if (status === 'denied') {
        badgeNotif.className = 'badge bad';
        badgeNotif.innerHTML = '<i class="d"></i>Notifications blocked';
        descNotif.textContent = 'Notifications blocked by browser. Click site settings in address bar to allow.';
        btnToggleNotif.innerHTML = icon('alert') + 'Blocked by Browser';
        btnToggleNotif.className = 'btn ghost';
        btnToggleNotif.disabled = true;
      } else {
        badgeNotif.className = 'badge neutral';
        badgeNotif.innerHTML = '<i class="d"></i>Not enabled';
        descNotif.textContent = 'Click below to allow instant order notifications on this device.';
        btnToggleNotif.innerHTML = icon('zap') + 'Enable Notifications';
        btnToggleNotif.className = 'btn primary';
        btnToggleNotif.disabled = false;
      }
    }

    if (btnToggleNotif) {
      btnToggleNotif.addEventListener('click', function () {
        btnToggleNotif.disabled = true;
        btnToggleNotif.innerHTML = UI.spinner() + ' Requesting…';

        global.Notifications.enable()
          .then(function () {
            updateNotifUI();
            CC.toast('Push notifications enabled for this device!', 'ok');
          })
          .catch(function (err) {
            updateNotifUI();
            CC.toast(err.message || 'Could not enable notifications', 'bad');
          })
          .finally(function () {
            btnToggleNotif.disabled = false;
          });
      });
    }

    if (chkAlerts) {
      chkAlerts.addEventListener('change', function () {
        global.Notifications.setOrderAlertsEnabled(this.checked);
        CC.toast('Order alerts ' + (this.checked ? 'enabled' : 'disabled'), 'ok');
      });
    }

    if (chkSound) {
      chkSound.addEventListener('change', function () {
        global.Notifications.setSoundEnabled(this.checked);
        CC.toast('Order chime ' + (this.checked ? 'enabled' : 'disabled'), 'ok');
      });
    }

    if (rngVol) {
      rngVol.addEventListener('input', function () {
        var v = parseFloat(this.value);
        if (volLabel) volLabel.textContent = Math.round(v * 100) + '%';
        global.Notifications.setSoundVolume(v);
      });
    }

    if (btnTestS) {
      btnTestS.addEventListener('click', function () {
        global.Notifications.testSound();
        CC.toast('Playing test order chime…', 'ok');
      });
    }

    if (btnTestN) {
      btnTestN.addEventListener('click', function () {
        btnTestN.disabled = true;
        var prev = btnTestN.innerHTML;
        btnTestN.innerHTML = UI.spinner() + ' Dispatching…';

        global.Notifications.playOrderSound();

        global.Notifications.test()
          .then(function () {
            CC.toast('Test notification dispatched! Check your system banner.', 'ok');
          })
          .catch(function (err) {
            CC.toast(err.message || 'Test push notification failed', 'bad');
          })
          .finally(function () {
            btnTestN.disabled = false;
            btnTestN.innerHTML = prev;
          });
      });
    }

    var btnSaveVapid = root.querySelector('#btnSaveVapid');
    var txtVapid = root.querySelector('#txtVapidKey');
    if (btnSaveVapid && txtVapid) {
      btnSaveVapid.addEventListener('click', function () {
        var val = (txtVapid.value || '').trim();
        if (val) {
          localStorage.setItem('vantro_vapid_key', val);
          if (global.FIREBASE_WEB_CONFIG) global.FIREBASE_WEB_CONFIG.vapidKey = val;
          CC.toast('Web Push Certificate (VAPID Key) saved! Click "Register Device" above.', 'ok');
        } else {
          localStorage.removeItem('vantro_vapid_key');
          CC.toast('VAPID key reset to default.', 'ok');
        }
      });
    }

    updateNotifUI();

    // =========================================================================
    // ACCOUNT & TEAM HANDLERS
    // =========================================================================
    var logoutBtn = root.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        CC.confirmModal({
          title: 'Sign out of Console?',
          body: 'You will need to sign in again to access the Command Center.',
          ok: 'Sign out',
          danger: true
        }).then(function (ok) {
          if (ok) global.App.logout();
        });
      });
    }

    if (isSuper) {
      var addMemberBtn = root.querySelector('#addMember');
      if (addMemberBtn) {
        addMemberBtn.addEventListener('click', function () {
          var tmName = (root.querySelector('#tmName') ? root.querySelector('#tmName').value : '').trim();
          var tmEmail = (root.querySelector('#tmEmail') ? root.querySelector('#tmEmail').value : '').trim();
          var tmPassword = root.querySelector('#tmPass') ? root.querySelector('#tmPass').value : '';
          var roleVal = root.querySelector('#tmRole') ? root.querySelector('#tmRole').value : 'admin';
          if (tmName.length < 2) { CC.toast('Name must be at least 2 characters', 'bad'); return; }
          if (!/^\S+@\S+\.\S+$/.test(tmEmail)) { CC.toast('Enter a valid email address', 'bad'); return; }
          if (tmPassword.length < 6) { CC.toast('Password must be at least 6 characters', 'bad'); return; }
          addMemberBtn.disabled = true;
          CC.API.post('/admin/register', { name: tmName, email: tmEmail, password: tmPassword, role: roleVal })
            .then(function () {
              CC.toast('Team member created successfully!', 'ok');
              if (root.querySelector('#tmName')) root.querySelector('#tmName').value = '';
              if (root.querySelector('#tmEmail')) root.querySelector('#tmEmail').value = '';
              if (root.querySelector('#tmPass')) root.querySelector('#tmPass').value = '';
            }).catch(function (e) { CC.toast(e.message, 'bad'); })
            .finally(function () { addMemberBtn.disabled = false; });
        });
      }
    }
  }

  global.Views.settings = { title: 'Settings', crumb: 'Settings', render: render };
})(window);
