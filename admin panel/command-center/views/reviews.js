/* ============================================================================
   View: Reviews — Comprehensive Review Management
   API:
     GET    /reviews/admin?status=
     PUT    /reviews/:id/moderate
     DELETE /reviews/:id
     POST   /reviews/admin/create
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, locName = CC.locName;

  var currentStatus = 'all';
  var searchQuery = '';
  var ratingFilter = 'all';
  var cachedReviews = [];
  var cachedStats = null;
  var cachedProducts = [];

  function render(root) {
    root.innerHTML =
      '<div class="page-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">' +
        '<div>' +
          '<div class="eyebrow">Catalog & Feedback</div>' +
          '<h1 style="margin:4px 0 6px">Customer Reviews</h1>' +
          '<div class="sub" id="revSub">Manage customer feedback, testimonials, and approvals</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          '<button class="btn ghost" id="btnRefreshReviews" title="Refresh reviews">' + icon('refresh') + 'Refresh</button>' +
          '<button class="btn primary" id="btnAddReview">' + icon('plus') + 'Add Testimonial</button>' +
        '</div>' +
      '</div>' +

      '<!-- KPI Overview -->' +
      '<div class="grid grid-4" id="revKpis" style="margin-bottom:24px">' +
        UI.skelKpis(4) +
      '</div>' +

      '<!-- Toolbar -->' +
      '<div class="panel" style="padding:14px 18px;margin-bottom:20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap" id="revTabs">' +
          '<button class="btn sm ' + (currentStatus === 'all' ? 'primary' : 'ghost') + '" data-tab="all">All Reviews <span class="badge-count" id="countAll">-</span></button>' +
          '<button class="btn sm ' + (currentStatus === 'pending_moderation' ? 'primary' : 'ghost') + '" data-tab="pending_moderation">Pending <span class="badge-count" id="countPending">-</span></button>' +
          '<button class="btn sm ' + (currentStatus === 'approved' ? 'primary' : 'ghost') + '" data-tab="approved">Approved <span class="badge-count" id="countApproved">-</span></button>' +
          '<button class="btn sm ' + (currentStatus === 'rejected' ? 'primary' : 'ghost') + '" data-tab="rejected">Rejected <span class="badge-count" id="countRejected">-</span></button>' +
        '</div>' +

        '<div style="display:flex;gap:10px;align-items:center;flex:1;max-width:440px;min-width:240px">' +
          '<div style="position:relative;flex:1">' +
            '<input type="search" class="input sm" id="revSearch" placeholder="Search customer, product, review..." value="' + esc(searchQuery) + '" style="width:100%" />' +
          '</div>' +
          '<select class="select sm" id="revRatingFilter" style="width:130px">' +
            '<option value="all"' + (ratingFilter === 'all' ? ' selected' : '') + '>All Ratings</option>' +
            '<option value="5"' + (ratingFilter === '5' ? ' selected' : '') + '>5 Stars ★★★★★</option>' +
            '<option value="4"' + (ratingFilter === '4' ? ' selected' : '') + '>4 Stars ★★★★</option>' +
            '<option value="3"' + (ratingFilter === '3' ? ' selected' : '') + '>3 Stars ★★★</option>' +
            '<option value="2"' + (ratingFilter === '2' ? ' selected' : '') + '>2 Stars ★★</option>' +
            '<option value="1"' + (ratingFilter === '1' ? ' selected' : '') + '>1 Star ★</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div id="revContainer">' + UI.spinner() + '</div>' +
      '<div id="revModalHost"></div>';

    // Event listeners
    root.querySelector('#btnRefreshReviews').addEventListener('click', function () {
      load(root);
    });

    root.querySelector('#btnAddReview').addEventListener('click', function () {
      openAddReviewModal(root);
    });

    root.querySelectorAll('#revTabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentStatus = this.getAttribute('data-tab');
        root.querySelectorAll('#revTabs button').forEach(function (b) {
          b.className = 'btn sm ghost';
        });
        this.className = 'btn sm primary';
        load(root);
      });
    });

    var searchInput = root.querySelector('#revSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value.trim().toLowerCase();
        renderFilteredList(root);
      });
    }

    var filterSelect = root.querySelector('#revRatingFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function () {
        ratingFilter = this.value;
        renderFilteredList(root);
      });
    }

    load(root);
    preloadProducts();
  }

  function preloadProducts() {
    if (cachedProducts.length) return;
    CC.API.get('/products?limit=100').then(function (res) {
      cachedProducts = (res && res.products) || [];
    }).catch(function (e) {
      console.warn('Failed to preload products for reviews:', e);
    });
  }

  function load(root) {
    var box = root.querySelector('#revContainer');
    if (box) box.innerHTML = UI.spinner();

    var url = '/reviews/admin' + (currentStatus === 'all' ? '' : '?status=' + currentStatus);
    CC.API.get(url).then(function (d) {
      cachedReviews = (d && d.reviews) || [];
      cachedStats = d && d.stats;

      updateStats(root, cachedStats);
      renderFilteredList(root);
    }).catch(function (e) {
      if (box) {
        box.innerHTML = UI.errorState(e.message, 'revRetry');
        var rt = box.querySelector('#revRetry');
        if (rt) rt.addEventListener('click', function () { load(root); });
      }
    });
  }

  function updateStats(root, stats) {
    if (!stats) return;

    var cAll = root.querySelector('#countAll');
    if (cAll) cAll.textContent = stats.total || 0;
    var cPen = root.querySelector('#countPending');
    if (cPen) cPen.textContent = stats.pending || 0;
    var cApp = root.querySelector('#countApproved');
    if (cApp) cApp.textContent = stats.approved || 0;
    var cRej = root.querySelector('#countRejected');
    if (cRej) cRej.textContent = stats.rejected || 0;

    var sub = root.querySelector('#revSub');
    if (sub) {
      sub.textContent = CC.num(stats.total) + ' total reviews · ' + (stats.pending || 0) + ' pending moderation · ' + stats.avgRating + ' avg rating';
    }

    // Update notification badge on sidebar if pending reviews
    if (global.CC && global.CC.setBadge) {
      global.CC.setBadge('reviews', stats.pending || 0);
    }

    var kpis = root.querySelector('#revKpis');
    if (kpis) {
      kpis.innerHTML =
        '<div class="panel kpi" style="padding:18px">' +
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:8px">Total Reviews</div>' +
          '<div style="font-size:28px;font-weight:700;font-family:var(--f-mono);color:var(--ink)">' + CC.num(stats.total) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-2);margin-top:4px">All customer feedback</div>' +
        '</div>' +
        '<div class="panel kpi" style="padding:18px">' +
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:8px">Average Rating</div>' +
          '<div style="font-size:28px;font-weight:700;font-family:var(--f-mono);color:#FFD700;display:flex;align-items:center;gap:6px">' +
            stats.avgRating + ' <span style="font-size:20px">★</span>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--ink-2);margin-top:4px">Out of 5.0 stars</div>' +
        '</div>' +
        '<div class="panel kpi" style="padding:18px;' + (stats.pending > 0 ? 'border-color:var(--warn);' : '') + '">' +
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:' + (stats.pending > 0 ? 'var(--warn)' : 'var(--ink-3)') + ';margin-bottom:8px">Pending Action</div>' +
          '<div style="font-size:28px;font-weight:700;font-family:var(--f-mono);color:' + (stats.pending > 0 ? 'var(--warn)' : 'var(--ink)') + '">' + CC.num(stats.pending) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-2);margin-top:4px">Awaiting moderation</div>' +
        '</div>' +
        '<div class="panel kpi" style="padding:18px">' +
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:8px">Approved Public</div>' +
          '<div style="font-size:28px;font-weight:700;font-family:var(--f-mono);color:var(--ok)">' + CC.num(stats.approved) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-2);margin-top:4px">Visible on storefront</div>' +
        '</div>';
    }
  }

  function renderFilteredList(root) {
    var box = root.querySelector('#revContainer');
    if (!box) return;

    var list = cachedReviews.filter(function (r) {
      if (ratingFilter !== 'all' && Number(r.rating) !== Number(ratingFilter)) {
        return false;
      }
      if (searchQuery) {
        var pName = (r.productId && locName(r.productId.title)) || '';
        var cName = r.customerName || (r.orderId && r.orderId.customerName) || '';
        var text = r.text || '';
        var str = (pName + ' ' + cName + ' ' + text).toLowerCase();
        if (str.indexOf(searchQuery) === -1) return false;
      }
      return true;
    });

    if (!list.length) {
      box.innerHTML = UI.emptyState({
        icon: 'star',
        title: 'No reviews found',
        body: searchQuery || ratingFilter !== 'all' ? 'No reviews match your search or filter criteria.' : 'No reviews recorded under this tab.'
      });
      return;
    }

    box.innerHTML = '<div class="grid grid-3" style="gap:18px">' + list.map(function (r) {
      var imgUrl = (r.productId && r.productId.image && r.productId.image[0]) ? r.productId.image[0] : '';
      var productName = r.productId ? locName(r.productId.title) : 'General Store Review';
      var customerName = r.customerName || (r.orderId ? r.orderId.customerName : 'Anonymous / Verified Buyer');
      var customerEmail = r.customerEmail || (r.orderId ? r.orderId.customerEmail : '');
      var dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

      var stars = '';
      for (var i = 1; i <= 5; i++) {
        stars += '<span style="color:' + (i <= r.rating ? '#FFD700' : 'var(--line)') + ';font-size:16px">★</span>';
      }

      var statusBadge = '';
      if (r.status === 'approved') {
        statusBadge = '<span class="badge ok" style="font-size:11px;padding:3px 8px">Approved</span>';
      } else if (r.status === 'pending_moderation') {
        statusBadge = '<span class="badge warn" style="font-size:11px;padding:3px 8px">Pending Moderation</span>';
      } else if (r.status === 'rejected') {
        statusBadge = '<span class="badge danger" style="font-size:11px;padding:3px 8px">Rejected</span>';
      } else {
        statusBadge = '<span class="badge ghost" style="font-size:11px;padding:3px 8px">Pending Submission</span>';
      }

      var buttonsHtml = '';
      if (r.status === 'pending_moderation') {
        buttonsHtml =
          '<button class="btn sm ghost danger btn-reject" data-id="' + esc(r._id) + '" title="Reject review">' + icon('x') + 'Reject</button>' +
          '<button class="btn sm ok grow btn-approve" data-id="' + esc(r._id) + '" title="Approve review">' + icon('check') + 'Approve</button>' +
          '<button class="btn sm ghost danger btn-delete" data-id="' + esc(r._id) + '" title="Delete review">' + icon('trash') + '</button>';
      } else if (r.status === 'approved') {
        buttonsHtml =
          '<button class="btn sm ghost btn-reject" data-id="' + esc(r._id) + '" title="Change to rejected">' + icon('x') + 'Reject</button>' +
          '<button class="btn sm ghost danger btn-delete" data-id="' + esc(r._id) + '" title="Delete review">' + icon('trash') + 'Delete</button>';
      } else {
        buttonsHtml =
          '<button class="btn sm ok grow btn-approve" data-id="' + esc(r._id) + '" title="Approve review">' + icon('check') + 'Approve</button>' +
          '<button class="btn sm ghost danger btn-delete" data-id="' + esc(r._id) + '" title="Delete review">' + icon('trash') + '</button>';
      }

      return '' +
        '<div class="panel" style="padding:18px;display:flex;flex-direction:column;gap:14px;border-radius:12px;position:relative">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
            '<div style="display:flex;align-items:center;gap:10px;min-width:0">' +
              (imgUrl
                ? '<img src="' + esc(imgUrl) + '" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--line);flex:none" />'
                : '<div class="thumb-ph" style="width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);color:var(--ink-3);flex:none">' + icon('box') + '</div>') +
              '<div style="min-width:0">' +
                '<div class="cell-strong" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(productName) + '">' + esc(productName) + '</div>' +
                '<div class="cell-sub" style="font-size:11px;color:var(--ink-3)">' + esc(dateStr) + '</div>' +
              '</div>' +
            '</div>' +
            '<div>' + statusBadge + '</div>' +
          '</div>' +

          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<div style="display:flex;gap:2px">' + stars + '</div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--ink)">' + esc(customerName) + (customerEmail ? ' <span style="font-size:11px;font-weight:400;color:var(--ink-3)">(' + esc(customerEmail) + ')</span>' : '') + '</div>' +
          '</div>' +

          '<div style="font-size:13px;color:var(--ink-2);background:var(--bg-card);padding:12px 14px;border-radius:8px;line-height:1.5;flex:1;min-height:54px;font-style:italic;border-left:3px solid var(--line)">' +
            '"' + esc(r.text || 'No review comment provided') + '"' +
          '</div>' +

          '<div style="display:flex;gap:8px;align-items:center;margin-top:auto;padding-top:4px">' +
            buttonsHtml +
          '</div>' +
        '</div>';
    }).join('') + '</div>';

    // Attach actions
    box.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', function () {
        moderate(root, btn.getAttribute('data-id'), 'approved');
      });
    });

    box.querySelectorAll('.btn-reject').forEach(function (btn) {
      btn.addEventListener('click', function () {
        moderate(root, btn.getAttribute('data-id'), 'rejected');
      });
    });

    box.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to permanently delete this review?')) {
          deleteReview(root, id);
        }
      });
    });
  }

  function moderate(root, id, status) {
    CC.API.put('/reviews/' + id + '/moderate', { status: status }).then(function () {
      CC.toast('Review marked as ' + status, 'ok');
      load(root);
    }).catch(function (err) {
      CC.toast(err.message || 'Failed to moderate review', 'bad');
    });
  }

  function deleteReview(root, id) {
    CC.API.delete('/reviews/' + id).then(function () {
      CC.toast('Review deleted permanently', 'ok');
      load(root);
    }).catch(function (err) {
      CC.toast(err.message || 'Failed to delete review', 'bad');
    });
  }

  function openAddReviewModal(root) {
    var modalHost = root.querySelector('#revModalHost');
    if (!modalHost) return;

    var productOptions = '<option value="">-- General Store Testimonial --</option>' +
      cachedProducts.map(function (p) {
        return '<option value="' + esc(p._id) + '">' + esc(locName(p.title)) + '</option>';
      }).join('');

    modalHost.innerHTML =
      '<div class="cmdk-scrim" id="addRevScrim" style="display:flex;align-items:center;justify-content:center;z-index:9999">' +
        '<div class="panel" style="width:100%;max-width:520px;padding:24px;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.5);margin:20px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">' +
            '<h3 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px">' + icon('star') + 'Add Verified Review</h3>' +
            '<button class="icon-btn" id="closeRevModal" style="background:transparent;border:none;cursor:pointer">' + icon('x') + '</button>' +
          '</div>' +
          '<form id="addRevForm" style="display:flex;flex-direction:column;gap:14px">' +
            '<div class="field">' +
              '<label style="font-size:12px;font-weight:600;margin-bottom:4px">Customer Name *</label>' +
              '<input class="input" type="text" id="mCustName" placeholder="e.g. Rahul Sharma" required />' +
            '</div>' +
            '<div class="field">' +
              '<label style="font-size:12px;font-weight:600;margin-bottom:4px">Customer Email (optional)</label>' +
              '<input class="input" type="email" id="mCustEmail" placeholder="e.g. rahul@example.com" />' +
            '</div>' +
            '<div class="field">' +
              '<label style="font-size:12px;font-weight:600;margin-bottom:4px">Product</label>' +
              '<select class="select" id="mProductId" style="width:100%">' + productOptions + '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label style="font-size:12px;font-weight:600;margin-bottom:4px">Rating *</label>' +
              '<select class="select" id="mRating" style="width:100%">' +
                '<option value="5" selected>5 Stars ★★★★★ (Excellent)</option>' +
                '<option value="4">4 Stars ★★★★☆ (Great)</option>' +
                '<option value="3">3 Stars ★★★☆☆ (Average)</option>' +
                '<option value="2">2 Stars ★★☆☆☆ (Poor)</option>' +
                '<option value="1">1 Star ★☆☆☆☆ (Terrible)</option>' +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label style="font-size:12px;font-weight:600;margin-bottom:4px">Review Feedback *</label>' +
              '<textarea class="input" id="mText" rows="4" placeholder="Write customer testimonial or feedback..." required style="resize:vertical"></textarea>' +
            '</div>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">' +
              '<button type="button" class="btn ghost" id="btnCancelModal">Cancel</button>' +
              '<button type="submit" class="btn primary" id="btnSubmitModal">' + icon('check') + 'Save & Publish</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

    var scrim = modalHost.querySelector('#addRevScrim');
    var closeBtn = modalHost.querySelector('#closeRevModal');
    var cancelBtn = modalHost.querySelector('#btnCancelModal');
    var form = modalHost.querySelector('#addRevForm');

    function closeModal() {
      modalHost.innerHTML = '';
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) closeModal();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('#btnSubmitModal');
      submitBtn.disabled = true;
      submitBtn.innerHTML = UI.spinner() + ' Saving...';

      var payload = {
        customerName: form.querySelector('#mCustName').value.trim(),
        customerEmail: form.querySelector('#mCustEmail').value.trim(),
        productId: form.querySelector('#mProductId').value || null,
        rating: Number(form.querySelector('#mRating').value),
        text: form.querySelector('#mText').value.trim(),
        status: 'approved'
      };

      CC.API.post('/reviews/admin/create', payload).then(function () {
        CC.toast('Review created and approved!', 'ok');
        closeModal();
        load(root);
      }).catch(function (err) {
        CC.toast(err.message || 'Failed to create review', 'bad');
        submitBtn.disabled = false;
        submitBtn.innerHTML = icon('check') + 'Save & Publish';
      });
    });
  }

  global.Views.reviews = { title: 'Reviews', crumb: 'Reviews', render: render };
})(window);
