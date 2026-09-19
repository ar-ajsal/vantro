/* ============================================================================
   View: Products — card/table hybrid catalog with inventory status, search,
   category filter, and a premium editor drawer with Cloudinary image upload.
   API:
     GET    /products?title=&category=&page=&limit=
     POST   /products/:id      → read one (Dashtar convention)
     POST   /products/add      → create
     PATCH  /products/:id      → update
     PUT    /products/status/:id { status }
     DELETE /products/:id
     GET    /category
     POST   /cloudinary  (multipart 'file') → returns URL string
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, money = CC.money, locName = CC.locName;

  var q = { title: '', category: '', page: 1, limit: 24, view: 'grid' };
  var _categories = [];

  function render(root, params) {
    q = { title: '', category: '', page: 1, limit: 24, view: q.view || 'grid' };

    root.innerHTML =
      '<div class="page-head">' +
      '<div><div class="eyebrow">Catalog</div><h1>Products</h1>' +
      '<div class="sub" id="prodSub">Loading…</div></div>' +
      '<div class="head-actions">' +
      '<div class="seg" id="viewSeg"><button data-view="grid" class="' + (q.view === 'grid' ? 'active' : '') + '">' + icon('grid') + '</button>' +
      '<button data-view="table" class="' + (q.view === 'table' ? 'active' : '') + '">' + icon('menu') + '</button></div>' +
      '<button class="btn primary" id="newProduct">' + icon('plus') + 'New product</button>' +
      '</div></div>' +
      '<div class="toolbar">' +
      '<div class="search-box grow">' + icon('search') +
      '<input class="input" id="prodSearch" placeholder="Search products by title…"></div>' +
      '<select class="select" id="prodCat"><option value="">All categories</option></select>' +
      '</div>' +
      '<div id="prodContainer">' + UI.spinner() + '</div>' +
      '<div id="prodPager" style="margin-top:16px"></div>';

    // categories for the filter + editor
    CC.API.get('/category').then(function (d) {
      _categories = (d && d.categories) || [];
      var sel = root.querySelector('#prodCat');
      sel.innerHTML = '<option value="">All categories</option>' + _categories.map(function (c) {
        return '<option value="' + esc(c._id) + '">' + esc(locName(c.name, 'Category')) + '</option>';
      }).join('');
    }).catch(function () {});

    var doSearch = CC.debounce(function () { q.title = root.querySelector('#prodSearch').value.trim(); q.page = 1; load(root); }, 300);
    root.querySelector('#prodSearch').addEventListener('input', doSearch);
    root.querySelector('#prodCat').addEventListener('change', function () { q.category = this.value; q.page = 1; load(root); });
    root.querySelector('#newProduct').addEventListener('click', function () { openEditor(null); });
    root.querySelector('#viewSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]'); if (!b) return;
      q.view = b.getAttribute('data-view');
      CC.qsa('#viewSeg button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      load(root);
    });

    load(root);
    if (params && params.id) openEditor(params.id);
  }

  function load(root) {
    var box = root.querySelector('#prodContainer');
    box.innerHTML = UI.spinner();
    var path = '/products?page=' + q.page + '&limit=' + q.limit +
      (q.title ? '&title=' + encodeURIComponent(q.title) : '') +
      (q.category ? '&category=' + encodeURIComponent(q.category) : '');

    CC.API.get(path).then(function (d) {
      var products = (d && d.products) || [];
      root.querySelector('#prodSub').textContent = CC.num(d.totalDoc || 0) + ' product' + ((d.totalDoc === 1) ? '' : 's');
      if (!products.length) {
        box.innerHTML = UI.emptyState({ icon: 'box', title: 'No products found', body: 'Create your first product to get started.', actionLabel: 'New product', actionId: 'emptyNew' });
        var en = box.querySelector('#emptyNew'); if (en) en.addEventListener('click', function () { openEditor(null); });
        root.querySelector('#prodPager').innerHTML = '';
        return;
      }
      box.innerHTML = q.view === 'grid' ? gridHtml(products) : tableHtml(products);
      bindCards(root, box, products);
      root.querySelector('#prodPager').innerHTML = UI.pager(q.page, d.pages || 1, d.totalDoc || 0, q.limit);
      root.querySelector('#prodPager').querySelectorAll('[data-page]').forEach(function (b) {
        b.addEventListener('click', function () { if (b.getAttribute('data-page') === 'next') q.page++; else q.page--; load(root); });
      });
    }).catch(function (e) {
      box.innerHTML = UI.errorState(e.message, 'prodRetry');
      var rt = box.querySelector('#prodRetry'); if (rt) rt.addEventListener('click', function () { load(root); });
    });
  }

  function stockBadge(stock) {
    stock = stock || 0;
    if (stock === 0) return '<span class="badge bad">Out of stock</span>';
    if (stock <= 5) return '<span class="badge warn">' + stock + ' left</span>';
    return '<span class="badge ok">' + stock + ' in stock</span>';
  }

  function priceHtml(p) {
    var pr = p.prices || {};
    var price = pr.price || 0, orig = pr.originalPrice || 0;
    return '<span class="prod-price">' +
      (orig && orig > price ? '<del>' + money(orig) + '</del>' : '') +
      money(price) + '</span>';
  }

  function gridHtml(products) {
    return '<div class="prod-grid">' + products.map(function (p) {
      var img = (p.image && p.image[0]) ? '<img src="' + esc(p.image[0]) + '" alt="">' : '<div class="ph">' + icon('box') + '</div>';
      var hidden = (p.status || 'show') !== 'show';
      return '<div class="prod-card" data-id="' + esc(p._id) + '" draggable="true">' +
        '<div class="prod-media">' + img +
        '<div class="prod-stockflag">' + stockBadge(p.stock) + '</div>' +
        (hidden ? '<div class="prod-visflag"><span class="badge neutral">' + icon('eye-off') + 'Hidden</span></div>' : '') +
        (p.isBestSeller ? '<div style="position:absolute;top:8px;left:8px"><span class="badge" style="background:#0A0A0B;color:#fff;font-size:10px">★ Best Seller</span></div>' : '') +
        '</div>' +
        '<div class="prod-body">' +
        '<div class="prod-title">' + esc(locName(p.title, 'Untitled')) + '</div>' +
        '<div class="prod-meta">' + priceHtml(p) + (p.isBestSeller ? ' <span class="badge" style="background:#0A0A0B;color:#fff;font-size:9px;vertical-align:middle">Best Seller</span>' : '') + '</div>' +
        '</div>' +
        '<div class="prod-actions">' +
        '<button class="btn sm" data-edit="' + esc(p._id) + '">' + icon('edit') + 'Edit</button>' +
        '<button class="btn sm ghost" data-toggle="' + esc(p._id) + '" title="' + (hidden ? 'Show' : 'Hide') + '">' + icon(hidden ? 'eye' : 'eye-off') + '</button>' +
        '<button class="btn sm ghost" data-del="' + esc(p._id) + '" title="Delete">' + icon('trash') + '</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function tableHtml(products) {
    return '<div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Flags</th><th></th>' +
      '</tr></thead><tbody>' + products.map(function (p) {
        var img = (p.image && p.image[0]) ? '<img class="thumb" src="' + esc(p.image[0]) + '" alt="">' : '<div class="thumb thumb-ph">' + icon('box') + '</div>';
        var hidden = (p.status || 'show') !== 'show';
        var catName = catFor(p);
        return '<tr data-id="' + esc(p._id) + '" draggable="true">' +
          '<td data-label="Product"><div style="display:flex;align-items:center;gap:12px">' + img +
          '<span class="cell-strong">' + esc(locName(p.title, 'Untitled')) + '</span></div></td>' +
          '<td data-label="Category">' + esc(catName) + '</td>' +
          '<td data-label="Price">' + priceHtml(p) + '</td>' +
          '<td data-label="Stock">' + stockBadge(p.stock) + '</td>' +
          '<td data-label="Status"><span class="badge ' + (hidden ? 'neutral' : 'ok') + '">' + (hidden ? 'Hidden' : 'Live') + '</span></td>' +
          '<td data-label="Flags">' + (p.isBestSeller ? '<span class="badge" style="background:#0A0A0B;color:#fff;font-size:9px">★ Best Seller</span>' : '—') + '</td>' +
          '<td data-label="" class="no-label"><div class="row-actions">' +
          '<button class="mini-btn" data-edit="' + esc(p._id) + '" title="Edit">' + icon('edit') + '</button>' +
          '<button class="mini-btn" data-toggle="' + esc(p._id) + '" title="' + (hidden ? 'Show' : 'Hide') + '">' + icon(hidden ? 'eye' : 'eye-off') + '</button>' +
          '<button class="mini-btn danger" data-del="' + esc(p._id) + '" title="Delete">' + icon('trash') + '</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function catFor(p) {
    var id = p.category || (p.categories && p.categories[0]);
    if (id && typeof id === 'object') return locName(id.name, '—');
    var c = _categories.find(function (x) { return x._id === id; });
    return c ? locName(c.name, '—') : '—';
  }

  function bindCards(root, box, products) {
    box.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); openEditor(b.getAttribute('data-edit')); });
    });
    box.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = products.find(function (x) { return x._id === b.getAttribute('data-toggle'); });
        var next = (p && (p.status || 'show') === 'show') ? 'hide' : 'show';
        CC.API.put('/products/status/' + b.getAttribute('data-toggle'), { status: next })
          .then(function () { CC.toast('Product ' + (next === 'show' ? 'shown' : 'hidden')); load(root); })
          .catch(function (e) { CC.toast(e.message, 'bad'); });
      });
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = products.find(function (x) { return x._id === b.getAttribute('data-del'); });
        CC.confirmModal({ title: 'Delete product?', body: 'Delete "' + locName(p && p.title, 'this product') + '"? This cannot be undone.', ok: 'Delete', danger: true })
          .then(function (ok) {
            if (!ok) return;
            CC.API.del('/products/' + b.getAttribute('data-del'))
              .then(function () { CC.toast('Product deleted'); load(root); })
              .catch(function (e) { CC.toast(e.message, 'bad'); });
          });
      });
    });
    // click card/row body → edit and drag-and-drop
    var draggedRow = null;
    box.querySelectorAll('[data-id]').forEach(function (c) {
      c.addEventListener('click', function () { openEditor(c.getAttribute('data-id')); });

      c.addEventListener('dragstart', function (e) {
        draggedRow = this;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
      });
      c.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });
      c.addEventListener('dragleave', function () {
        this.classList.remove('drag-over');
      });
      c.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (draggedRow && draggedRow !== this) {
          var parent = this.parentNode;
          var rect = this.getBoundingClientRect();
          var isAfter = (q.view === 'table') 
            ? (e.clientY > rect.top + rect.height / 2) 
            : (e.clientX > rect.left + rect.width / 2);
            
          if (isAfter) {
            parent.insertBefore(draggedRow, this.nextSibling);
          } else {
            parent.insertBefore(draggedRow, this);
          }
          
          var newOrder = [];
          parent.querySelectorAll('[data-id]').forEach(function(el) {
            newOrder.push(el.getAttribute('data-id'));
          });
          
          CC.API.put('/products/reorder', { productIds: newOrder })
            .then(function() { CC.toast('Products reordered'); })
            .catch(function(e) { CC.toast(e.message, 'bad'); load(root); });
        }
      });
      c.addEventListener('dragend', function () {
        this.classList.remove('dragging');
      });
    });
  }

  function ensureCategories() {
    if (_categories && _categories.length) return Promise.resolve(_categories);
    return CC.API.get('/category').then(function (d) {
      _categories = (d && d.categories) || [];
      return _categories;
    }).catch(function () { return []; });
  }

  // ---- Editor drawer --------------------------------------------------------
  function openEditor(id) {
    var isNew = !id;
    UI.openDrawer({
      title: isNew ? 'New product' : 'Edit product',
      sub: isNew ? 'Create a catalog entry' : 'Loading…',
      wide: true,
      bodyHtml: isNew ? '' : UI.spinner(),
      onMount: function (drawerEl, close) {
        ensureCategories().then(function () {
          if (isNew) {
            mountForm(drawerEl, {}, close);
          } else {
            CC.API.post('/products/' + id).then(function (p) {
              drawerEl.querySelector('.drawer-head .sub').textContent = CC.locName(p.title, '');
              mountForm(drawerEl, p, close);
            }).catch(function (e) {
              drawerEl.querySelector('#drawerBody').innerHTML = UI.errorState(e.message);
            });
          }
        });
      }
    });
  }

  function mountForm(drawerEl, p, close) {
    var pr = p.prices || {};
    var images = (p.image || []).slice();
    var currentCat = p.category || (p.categories && p.categories[0]);
    if (currentCat && typeof currentCat === 'object') currentCat = currentCat._id;

    // ── Product Configuration Mode ──────────────────────────────────────────
    var prodType = 'simple';
    if (p.isCombination || (Array.isArray(p.variants) && p.variants.some(function(v) { return v && typeof v === 'object' && (v.combination || (v.price && v.variant)); }))) {
      prodType = 'variants';
    } else if ((Array.isArray(p.options) && p.options.length > 0) || (Array.isArray(p.variants) && p.variants.length > 0)) {
      prodType = 'options';
    }

    // ── Options State ────────────────────────────────────────────────────────
    var optionsState = [];
    if (Array.isArray(p.options) && p.options.length > 0) {
      optionsState = p.options.map(function(o) {
        return { group: o.name, options: (Array.isArray(o.values) ? o.values : []).slice() };
      });
    } else if (Array.isArray(p.variants) && p.variants.length > 0) {
      var isGrouped = p.variants.some(function(v) { return v && v.group && Array.isArray(v.options); });
      if (isGrouped) {
        var gMap = {};
        var gOrd = [];
        p.variants.forEach(function(v) {
          if (!v || !v.group) return;
          var gn = String(v.group).trim();
          var gk = gn.toLowerCase();
          if (!gMap[gk]) { gMap[gk] = { group: gn, options: [] }; gOrd.push(gk); }
          (Array.isArray(v.options) ? v.options : []).forEach(function(opt) {
            var ostr = String(opt).trim();
            if (ostr && gMap[gk].options.indexOf(ostr) === -1) gMap[gk].options.push(ostr);
          });
        });
        optionsState = gOrd.map(function(k) { return gMap[k]; });
      } else {
        var stringVals = p.variants.map(function(v) {
          return typeof v === 'string' ? v : (v && (v.name || v.label || v.title || v.size || v.color)) || '';
        }).filter(Boolean);
        if (stringVals.length > 0) {
          optionsState.push({ group: 'Options', options: stringVals });
        }
      }
    }

    // ── Combination Variants State ───────────────────────────────────────────
    var variantsState = [];
    if (Array.isArray(p.variants)) {
      variantsState = p.variants.filter(function(v) {
        return v && typeof v === 'object' && (v.variant || v.combination);
      }).map(function(v) {
        return {
          variant: v.variant || (v.combination ? Object.keys(v.combination).map(function(k) { return v.combination[k]; }).join(' / ') : ''),
          combination: v.combination || {},
          sku: v.sku || '',
          price: typeof v.price === 'number' ? v.price : (pr.price || 0),
          stock: typeof v.stock === 'number' ? v.stock : (p.stock || 0),
          image: v.image || ''
        };
      });
    }

    // ── Quantity Pricing State ────────────────────────────────────────────────
    var qtyPricingState = Array.isArray(p.qtyPricing) ? p.qtyPricing.map(function(t) {
      return { minQty: t.minQty, price: t.price };
    }) : [];

    var body = drawerEl.querySelector('#drawerBody');
    body.innerHTML =
      '<div class="dsec"><div class="dsec-title">' + icon('image') + 'Images</div>' +
      '<div class="uploader" id="uploader"></div>' +
      '<div class="hint" style="font-size:11px;color:var(--ink-3);display:flex;justify-content:space-between;align-items:center;margin-top:6px;">' +
      '<span>First image is the cover. JPG/PNG/WebP.</span>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--ink-2);font-weight:600;"><input type="checkbox" id="removeBgCheck" checked> Remove Background (AI)</label>' +
      '</div></div>' +

      '<div class="dsec"><div class="dsec-title">' + icon('tag') + 'Details</div>' +
      '<div class="field"><label>Title <span style="color:var(--bad)">*</span></label><input class="input" id="fTitle" value="' + esc(CC.locName(p.title, '')) + '" placeholder="Product title"></div>' +
      '<div class="field"><label>Slug</label><input class="input" id="fSlug" value="' + esc(p.slug || '') + '" placeholder="auto-generated-if-blank"></div>' +
      '<div class="field"><label>Description</label><textarea class="input" id="fDesc" placeholder="Short description">' + esc(CC.locName(p.description, '')) + '</textarea></div>' +
      '<div class="field"><label>Category <span style="color:var(--bad)">*</span></label>' +
      '<select class="select" id="fCat"><option value="">— Select a Category (Required) —</option>' +
      _categories.map(function (c) { return '<option value="' + esc(c._id) + '"' + (c._id === currentCat ? ' selected' : '') + '>' + esc(CC.locName(c.name, 'Category')) + '</option>'; }).join('') +
      '</select><div class="hint" style="font-size:11px;color:var(--ink-3)">Every product must be assigned to a category.</div></div></div>' +

      '<div class="dsec"><div class="dsec-title">' + icon('rupee') + 'Pricing &amp; stock</div>' +
      '<div class="grid grid-3" style="gap:12px">' +
      '<div class="field"><label>Base Price (₹)</label><input class="input" id="fPrice" type="number" min="0" step="1" value="' + (pr.price || 0) + '"></div>' +
      '<div class="field"><label>Compare-at (₹)</label><input class="input" id="fOrig" type="number" min="0" step="1" value="' + (pr.originalPrice || 0) + '"></div>' +
      '<div class="field"><label>Stock</label><input class="input" id="fStock" type="number" min="0" step="1" value="' + (p.stock || 0) + '"></div>' +
      '</div></div>' +

      // ── Product Configuration Mode ───────────────────────────────────────
      '<div class="dsec">' +
        '<div class="dsec-title">' + icon('sliders') + 'Product Configuration</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-top:8px">' +
          '<label class="prod-type-card' + (prodType === 'simple' ? ' is-active' : '') + '" data-type="simple">' +
            '<input type="radio" name="prodType" value="simple"' + (prodType === 'simple' ? ' checked' : '') + ' style="display:none">' +
            '<div style="font-weight:700;font-size:13px;color:var(--ink)">Simple Product</div>' +
            '<div style="font-size:11px;color:var(--ink-3);margin-top:2px">Single price &amp; stock, no options</div>' +
          '</label>' +
          '<label class="prod-type-card' + (prodType === 'options' ? ' is-active' : '') + '" data-type="options">' +
            '<input type="radio" name="prodType" value="options"' + (prodType === 'options' ? ' checked' : '') + ' style="display:none">' +
            '<div style="font-weight:700;font-size:13px;color:var(--ink)">With Options</div>' +
            '<div style="font-size:11px;color:var(--ink-3);margin-top:2px">Selectable choices (e.g. Connector)</div>' +
          '</label>' +
          '<label class="prod-type-card' + (prodType === 'variants' ? ' is-active' : '') + '" data-type="variants">' +
            '<input type="radio" name="prodType" value="variants"' + (prodType === 'variants' ? ' checked' : '') + ' style="display:none">' +
            '<div style="font-weight:700;font-size:13px;color:var(--ink)">With Variants</div>' +
            '<div style="font-size:11px;color:var(--ink-3);margin-top:2px">Independent price, stock &amp; SKU</div>' +
          '</label>' +
        '</div>' +
      '</div>' +

      // ── Product Options Section (visible for options and variants modes) ──
      '<div class="dsec" id="optionsSection" style="' + (prodType === 'simple' ? 'display:none;' : '') + '">' +
        '<div class="dsec-title">' + icon('sliders') + 'Selectable Options</div>' +
        '<div style="font-size:12px;color:var(--ink-3);margin-bottom:12px;line-height:1.5">' +
          'Define option axes (e.g. Connector, Color, Size). Each option has a name and comma-separated values.' +
        '</div>' +
        '<div id="optionsHost"></div>' +
        '<button class="btn ghost" id="addOptionBtn" style="margin-top:8px;font-size:12px;padding:6px 12px">' + icon('plus') + ' Add Option</button>' +
      '</div>' +

      // ── Combination Variants Matrix Section (visible only for variants mode)
      '<div class="dsec" id="variantsMatrixSection" style="' + (prodType !== 'variants' ? 'display:none;' : '') + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<div class="dsec-title" style="margin:0">' + icon('box') + 'Combination Matrix</div>' +
          '<button class="btn sm" id="generateCombosBtn" style="font-size:11px;padding:4px 10px">' + icon('refresh-cw') + ' Generate Combinations</button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--ink-3);margin-bottom:12px;line-height:1.5">' +
          'Configure independent pricing, stock, SKU and image for each option combination.' +
        '</div>' +
        '<div id="variantsMatrixHost"></div>' +
      '</div>' +

      // ── Quantity Pricing Section (Buy More Save More) ────────────────────
      '<div class="dsec">' +
        '<div class="dsec-title">' + icon('dollar') + 'Quantity Pricing <span style="font-weight:400;font-size:12px;color:var(--ink-3);font-family:var(--f-body)">(Buy More Save More)</span></div>' +
        '<div style="font-size:12px;color:var(--ink-3);margin-bottom:12px;line-height:1.5">' +
          'Offer lower prices for higher quantities. Leave empty to use the base price for all quantities.' +
        '</div>' +
        '<div id="qtyPricingHost"></div>' +
        '<button class="btn ghost" id="addTierBtn" style="margin-top:8px;font-size:12px;padding:6px 12px">' + icon('plus') + ' Add Pricing Tier</button>' +
      '</div>' +

      '<div class="dsec"><div class="dsec-title">' + icon('settings') + 'Visibility</div>' +
      '<div class="field"><label>Status</label><select class="select" id="fStatus">' +
      '<option value="show"' + ((p.status || 'show') === 'show' ? ' selected' : '') + '>Live (visible)</option>' +
      '<option value="hide"' + ((p.status || 'show') === 'hide' ? ' selected' : '') + '>Hidden</option>' +
      '</select></div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);margin-top:6px">' +
      '<input type="checkbox" id="fFeatured"' + (p.isFeatured ? ' checked' : '') + '> Featured product</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);margin-top:6px;font-weight:600">' +
      '<input type="checkbox" id="fBestSeller"' + (p.isBestSeller ? ' checked' : '') + '> ★ Best Seller <span style="font-weight:400;color:var(--ink-3);font-size:12px">(shows in Best Sellers section on homepage)</span></label>' +
      '</div>';

    // footer
    var foot = drawerEl.querySelector('.drawer-foot') || (function () {
      var f = CC.el('div', { class: 'drawer-foot' }); drawerEl.appendChild(f); return f;
    })();
    foot.innerHTML =
      '<button class="btn ghost" id="cancelEdit">Cancel</button>' +
      '<button class="btn primary" id="saveProduct">' + icon('save') + (p._id ? 'Save changes' : 'Create product') + '</button>';

    // ──────────────────────────────────────────────────────────────────────────
    // Mode Switcher Wire
    // ──────────────────────────────────────────────────────────────────────────
    body.querySelectorAll('.prod-type-card').forEach(function(card) {
      card.addEventListener('click', function() {
        prodType = card.getAttribute('data-type');
        body.querySelectorAll('.prod-type-card').forEach(function(c) {
          c.classList.toggle('is-active', c === card);
        });
        var optSec = body.querySelector('#optionsSection');
        var varSec = body.querySelector('#variantsMatrixSection');
        if (optSec) optSec.style.display = (prodType === 'simple') ? 'none' : 'block';
        if (varSec) varSec.style.display = (prodType === 'variants') ? 'block' : 'none';
      });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Image uploader
    // ──────────────────────────────────────────────────────────────────────────
    function renderUploader() {
      var host = body.querySelector('#uploader');
      host.innerHTML = images.map(function (url, i) {
        return '<div class="up-thumb" draggable="true" data-index="' + i + '"><img src="' + esc(url) + '" alt="">' +
          '<button class="rm" data-rm="' + i + '" title="Remove">' + icon('x') + '</button></div>';
      }).join('') +
        '<label class="up-slot" title="Upload image">' + icon('upload') +
        '<input type="file" accept="image/*" hidden id="fileInput"></label>';

      host.querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () { images.splice(+b.getAttribute('data-rm'), 1); renderUploader(); });
      });

      var draggedIdx = null;
      host.querySelectorAll('.up-thumb').forEach(function (thumb) {
        thumb.addEventListener('dragstart', function (e) {
          draggedIdx = +this.getAttribute('data-index');
          e.dataTransfer.effectAllowed = 'move';
          this.classList.add('dragging');
        });
        thumb.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          this.classList.add('drag-over');
        });
        thumb.addEventListener('dragleave', function () {
          this.classList.remove('drag-over');
        });
        thumb.addEventListener('drop', function (e) {
          e.preventDefault();
          this.classList.remove('drag-over');
          var targetIdx = +this.getAttribute('data-index');
          if (draggedIdx !== null && draggedIdx !== targetIdx) {
            var item = images.splice(draggedIdx, 1)[0];
            images.splice(targetIdx, 0, item);
            renderUploader();
          }
        });
        thumb.addEventListener('dragend', function () {
          this.classList.remove('dragging');
        });
      });
      var fi = host.querySelector('#fileInput');
      fi.addEventListener('change', function () {
        var file = fi.files && fi.files[0]; if (!file) return;
        var removeBg = body.querySelector('#removeBgCheck') ? body.querySelector('#removeBgCheck').checked : true;
        var slot = host.querySelector('.up-slot');
        slot.innerHTML = '<div class="spinner" style="width:22px;height:22px;border-width:2px;margin-bottom:8px"></div><div style="font-size:11px;text-align:center;color:var(--text-dim)">' + (removeBg ? 'Removing BG...' : 'Uploading...') + '</div>';
        slot.style.flexDirection = 'column';
        var uploadReq = removeBg ? CC.API.uploadProductImage(file) : CC.API.upload(file);
        uploadReq.then(function (res) {
          var url = typeof res === 'string' ? res : (res && (res.url || res.secure_url || res.path));
          if (!url) throw new Error('Upload failed.');
          images.push(url); renderUploader();
        }).catch(function (e) { CC.toast(e.message || 'Upload failed', 'bad'); renderUploader(); });
      });
    }
    renderUploader();

    // ──────────────────────────────────────────────────────────────────────────
    // Product Options (Universal & Dynamic)
    // ──────────────────────────────────────────────────────────────────────────
    function syncOptions() {
      var groups = body.querySelectorAll('.o-group');
      var opts   = body.querySelectorAll('.o-opts');
      optionsState = [];
      for (var i = 0; i < groups.length; i++) {
        var gName = groups[i].value.trim();
        var optVals = opts[i].value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (gName || optVals.length) {
          optionsState.push({ group: gName, options: optVals });
        }
      }
    }

    function renderOptions() {
      var host = body.querySelector('#optionsHost');
      if (!optionsState.length) {
        host.innerHTML =
          '<div style="background:var(--paper-sink);border:1px dashed var(--ink-hair);border-radius:var(--r-2);padding:16px 20px;text-align:center;color:var(--ink-3);font-size:13px">' +
            icon('sliders') + ' No options configured. Click <strong>Add Option</strong> to define Size, Color, Connector, etc.' +
          '</div>';
        return;
      }
      host.innerHTML = optionsState.map(function(v, i) {
        return '<div style="background:var(--paper-sink);border:1px solid var(--ink-hair);border-radius:var(--r-2);padding:14px 14px 14px 16px;margin-bottom:10px;position:relative">' +
          '<button class="del-option" data-idx="' + i + '" title="Remove option" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--bad);cursor:pointer;padding:4px">' + icon('trash') + '</button>' +
          '<div class="grid" style="grid-template-columns:1fr 2fr;gap:10px;padding-right:36px">' +
            '<div class="field" style="margin:0">' +
              '<label style="font-size:12px;font-weight:600;color:var(--ink-2)">Option Name</label>' +
              '<input class="input o-group" value="' + esc(v.group || '') + '" placeholder="e.g. Size, Color, Connector" style="margin-top:4px">' +
            '</div>' +
            '<div class="field" style="margin:0">' +
              '<label style="font-size:12px;font-weight:600;color:var(--ink-2)">Values <span style="font-weight:400;color:var(--ink-4)">(comma separated)</span></label>' +
              '<input class="input o-opts" value="' + esc((v.options || []).join(', ')) + '" placeholder="e.g. S, M, L, XL" style="margin-top:4px">' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      host.querySelectorAll('.del-option').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          syncOptions();
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          optionsState.splice(idx, 1);
          renderOptions();
        });
      });
    }
    renderOptions();

    var addOptBtn = body.querySelector('#addOptionBtn');
    if (addOptBtn) {
      addOptBtn.addEventListener('click', function(e) {
        e.preventDefault();
        syncOptions();
        optionsState.push({ group: '', options: [] });
        renderOptions();
        var inputs = body.querySelectorAll('.o-group');
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Combination Matrix Builder (Variants Mode)
    // ──────────────────────────────────────────────────────────────────────────
    function syncVariantsMatrix() {
      var rows = body.querySelectorAll('.v-row');
      variantsState = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var vTitle = r.getAttribute('data-variant');
        var comboJson = r.getAttribute('data-combo') || '{}';
        var combo = {};
        try { combo = JSON.parse(comboJson); } catch (e) {}

        var sku = (r.querySelector('.v-sku') && r.querySelector('.v-sku').value.trim()) || '';
        var prVal = parseFloat(r.querySelector('.v-price') && r.querySelector('.v-price').value);
        var stVal = parseInt(r.querySelector('.v-stock') && r.querySelector('.v-stock').value, 10);
        var imgVal = (r.querySelector('.v-img') && r.querySelector('.v-img').value.trim()) || '';

        variantsState.push({
          variant: vTitle,
          combination: combo,
          sku: sku,
          price: isNaN(prVal) ? 0 : prVal,
          stock: isNaN(stVal) ? 0 : stVal,
          image: imgVal
        });
      }
    }

    function renderVariantsMatrix() {
      var host = body.querySelector('#variantsMatrixHost');
      if (!host) return;
      if (!variantsState.length) {
        host.innerHTML =
          '<div style="background:var(--paper-sink);border:1px dashed var(--ink-hair);border-radius:var(--r-2);padding:16px 20px;text-align:center;color:var(--ink-3);font-size:13px">' +
            icon('box') + ' No combinations generated yet. Click <strong>Generate Combinations</strong> to auto-create variant rows from your options.' +
          '</div>';
        return;
      }

      host.innerHTML =
        '<div style="background:var(--paper-sink);border:1px solid var(--ink-hair);border-radius:var(--r-2);overflow-x:auto">' +
          '<table class="variant-matrix-tbl">' +
            '<thead>' +
              '<tr>' +
                '<th>Combination</th>' +
                '<th>SKU</th>' +
                '<th style="width:90px">Price (₹)</th>' +
                '<th style="width:80px">Stock</th>' +
                '<th>Image URL</th>' +
                '<th style="width:36px"></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              variantsState.map(function(v, i) {
                return '<tr class="v-row" data-idx="' + i + '" data-variant="' + esc(v.variant) + '" data-combo="' + esc(JSON.stringify(v.combination || {})) + '">' +
                  '<td style="font-weight:600;color:var(--ink)">' + esc(v.variant) + '</td>' +
                  '<td><input class="input v-sku" value="' + esc(v.sku || '') + '" placeholder="SKU" style="height:32px;font-size:11.5px"></td>' +
                  '<td><input class="input v-price" type="number" min="0" step="1" value="' + (v.price || 0) + '" style="height:32px;font-size:11.5px"></td>' +
                  '<td><input class="input v-stock" type="number" min="0" step="1" value="' + (v.stock || 0) + '" style="height:32px;font-size:11.5px"></td>' +
                  '<td><input class="input v-img" value="' + esc(v.image || '') + '" placeholder="https://..." style="height:32px;font-size:11.5px"></td>' +
                  '<td><button class="del-variant" data-idx="' + i + '" title="Remove combination" style="background:none;border:none;color:var(--bad);cursor:pointer;padding:4px">' + icon('trash') + '</button></td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';

      host.querySelectorAll('.del-variant').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          syncVariantsMatrix();
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          variantsState.splice(idx, 1);
          renderVariantsMatrix();
        });
      });
    }
    renderVariantsMatrix();

    var genCombosBtn = body.querySelector('#generateCombosBtn');
    if (genCombosBtn) {
      genCombosBtn.addEventListener('click', function(e) {
        e.preventDefault();
        syncOptions();
        var validGroups = optionsState.filter(function(g) { return g.group && g.options.length > 0; });
        if (!validGroups.length) {
          CC.toast('Add at least one option with values above first.', 'bad');
          return;
        }

        // Cartesian product
        var combos = [{}];
        validGroups.forEach(function(g) {
          var next = [];
          combos.forEach(function(c) {
            g.options.forEach(function(val) {
              var copy = Object.assign({}, c);
              copy[g.group] = val;
              next.push(copy);
            });
          });
          combos = next;
        });

        var basePrice = Math.max(0, parseFloat(body.querySelector('#fPrice').value) || 0);
        var baseStock = Math.max(0, parseInt(body.querySelector('#fStock').value, 10) || 0);
        var slug = body.querySelector('#fSlug').value.trim() || 'item';

        syncVariantsMatrix();
        var oldVariants = variantsState.slice();

        variantsState = combos.map(function(c, idx) {
          var vName = Object.keys(c).map(function(k) { return c[k]; }).join(' / ');
          var existing = oldVariants.find(function(ev) {
            return ev.variant === vName || (ev.combination && JSON.stringify(ev.combination) === JSON.stringify(c));
          });
          if (existing) {
            existing.combination = c;
            existing.variant = vName;
            return existing;
          }
          return {
            variant: vName,
            combination: c,
            sku: slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) + '-' + (idx + 1),
            price: basePrice,
            stock: baseStock,
            image: images[0] || ''
          };
        });

        renderVariantsMatrix();
        CC.toast('Generated ' + variantsState.length + ' combinations', 'ok');
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Quantity Pricing (Buy More Save More)
    // ──────────────────────────────────────────────────────────────────────────
    function syncQtyPricing() {
      var minQtyInputs = body.querySelectorAll('.tier-qty');
      var priceInputs  = body.querySelectorAll('.tier-price');
      qtyPricingState = [];
      for (var i = 0; i < minQtyInputs.length; i++) {
        var minQty = parseInt(minQtyInputs[i].value, 10);
        var price  = parseFloat(priceInputs[i].value);
        if (!isNaN(minQty) && minQty >= 1 && !isNaN(price) && price >= 0) {
          qtyPricingState.push({ minQty: minQty, price: price });
        }
      }
    }

    function renderQtyPricing() {
      var host = body.querySelector('#qtyPricingHost');
      if (!qtyPricingState.length) {
        host.innerHTML =
          '<div style="background:var(--paper-sink);border:1px dashed var(--ink-hair);border-radius:var(--r-2);padding:16px 20px;text-align:center;color:var(--ink-3);font-size:13px">' +
            icon('dollar') + ' No tiers configured. Click <strong>Add Pricing Tier</strong> to set up bulk discounts.' +
          '</div>';
        return;
      }

      var tableRows = qtyPricingState.map(function(t, i) {
        return '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:8px">' +
          '<div class="field" style="margin:0">' +
            '<label style="font-size:12px;font-weight:600;color:var(--ink-2)">Min Qty</label>' +
            '<input class="input tier-qty" type="number" min="1" step="1" value="' + t.minQty + '" placeholder="1" style="margin-top:4px">' +
          '</div>' +
          '<div class="field" style="margin:0">' +
            '<label style="font-size:12px;font-weight:600;color:var(--ink-2)">Price per item (₹)</label>' +
            '<input class="input tier-price" type="number" min="0" step="1" value="' + t.price + '" placeholder="899" style="margin-top:4px">' +
          '</div>' +
          '<button class="del-tier" data-idx="' + i + '" title="Remove tier" style="background:none;border:none;color:var(--bad);cursor:pointer;padding:8px;margin-bottom:2px">' + icon('trash') + '</button>' +
        '</div>';
      }).join('');

      host.innerHTML =
        '<div style="background:var(--paper-sink);border:1px solid var(--ink-hair);border-radius:var(--r-2);padding:14px 14px 6px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--ink-hair)">' +
            '<span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)">Min Qty</span>' +
            '<span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)">Price/item</span>' +
            '<span></span>' +
          '</div>' +
          tableRows +
        '</div>';

      host.querySelectorAll('.del-tier').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          syncQtyPricing();
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          qtyPricingState.splice(idx, 1);
          renderQtyPricing();
        });
      });
    }
    renderQtyPricing();

    var addTierBtn = body.querySelector('#addTierBtn');
    if (addTierBtn) {
      addTierBtn.addEventListener('click', function(e) {
        e.preventDefault();
        syncQtyPricing();
        var nextQty = 1;
        if (qtyPricingState.length > 0) {
          var max = Math.max.apply(null, qtyPricingState.map(function(t) { return t.minQty; }));
          nextQty = max + 1;
        }
        qtyPricingState.push({ minQty: nextQty, price: 0 });
        renderQtyPricing();
        var priceInputs = body.querySelectorAll('.tier-price');
        if (priceInputs.length) priceInputs[priceInputs.length - 1].focus();
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Save
    // ──────────────────────────────────────────────────────────────────────────
    foot.querySelector('#cancelEdit').addEventListener('click', close);
    foot.querySelector('#saveProduct').addEventListener('click', function () {
      var title = body.querySelector('#fTitle').value.trim();
      if (!title) { CC.toast('Title is required', 'bad'); body.querySelector('#fTitle').focus(); return; }
      var cat = body.querySelector('#fCat').value;
      if (!cat) {
        CC.toast('Category is required. Please choose a category for this product.', 'bad');
        body.querySelector('#fCat').focus();
        return;
      }
      var slug = body.querySelector('#fSlug').value.trim() ||
        title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var price = Math.max(0, parseFloat(body.querySelector('#fPrice').value) || 0);
      var orig  = Math.max(0, parseFloat(body.querySelector('#fOrig').value) || 0);
      var discount = orig > price ? orig - price : 0;
      var stock = Math.max(0, parseInt(body.querySelector('#fStock').value, 10) || 0);

      // Sync options
      syncOptions();
      var cleanOptions = optionsState.map(function(v) {
        if (!v.group && v.options.length > 0) v.group = 'Options';
        return v;
      }).filter(function(v) { return v.group && v.options.length > 0; });

      // Sync variants matrix
      syncVariantsMatrix();
      var cleanVariants = variantsState.filter(function(v) {
        return v.variant;
      });

      // Sync qty pricing
      syncQtyPricing();
      var cleanTiers = qtyPricingState.filter(function(t) {
        return t.minQty >= 1 && t.price >= 0;
      }).sort(function(a, b) { return a.minQty - b.minQty; });

      // Build payload based on prodType
      var finalOptions = [];
      var finalVariants = [];
      var isCombination = false;

      if (prodType === 'simple') {
        finalOptions = [];
        finalVariants = [];
        isCombination = false;
      } else if (prodType === 'options') {
        finalOptions = cleanOptions.map(function(o) { return { name: o.group, values: o.options }; });
        finalVariants = cleanOptions;
        isCombination = false;
      } else if (prodType === 'variants') {
        finalOptions = cleanOptions.map(function(o) { return { name: o.group, values: o.options }; });
        finalVariants = cleanVariants;
        isCombination = true;
        if (cleanVariants.length > 0) {
          var sumStock = cleanVariants.reduce(function(sum, v) { return sum + (v.stock || 0); }, 0);
          if (sumStock > 0) stock = sumStock;
        }
      }

      var payload = {
        title:         { en: title },
        description:   { en: body.querySelector('#fDesc').value.trim() },
        slug:          slug,
        category:      cat,
        categories:    [cat],
        image:         images,
        stock:         stock,
        prices:        { price: price, originalPrice: orig || price, discount: discount },
        status:        body.querySelector('#fStatus').value,
        isFeatured:    body.querySelector('#fFeatured').checked,
        isBestSeller:  body.querySelector('#fBestSeller').checked,
        isCombination: isCombination,
        options:       finalOptions,
        variants:      finalVariants,
        qtyPricing:    cleanTiers
      };

      var btn = foot.querySelector('#saveProduct'); btn.disabled = true;
      var req = p._id ? CC.API.patch('/products/' + p._id, payload) : CC.API.post('/products/add', payload);
      req.then(function () {
        CC.toast(p._id ? 'Product updated' : 'Product created', 'ok');
        close();
        global.App.render();
      }).catch(function (e) { CC.toast(e.message, 'bad'); btn.disabled = false; });
    });
  }

  global.Views.products = { title: 'Products', crumb: 'Products', render: render, openEditor: openEditor };
})(window);

