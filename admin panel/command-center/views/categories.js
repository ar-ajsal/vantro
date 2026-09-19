/* ============================================================================
   View: Categories — grid of categories with images, inline create/edit/delete,
   and show/hide status. Names are stored as { en: "…" } objects.
   API:
     GET    /category            → { categories[] }
     POST   /category/add        → create
     PUT    /category/:id        → update
     PUT    /category/status/:id → { status }
     DELETE /category/:id
     POST   /cloudinary          (multipart 'file') → returns URL string
   ========================================================================== */
(function (global) {
  'use strict';
  global.Views = global.Views || {};
  var CC = global.CC, UI = global.UI, icon = global.icon;
  var esc = CC.esc, locName = CC.locName;

  function render(root) {
    root.innerHTML =
      '<div class="page-head">' +
      '<div><div class="eyebrow">Catalog</div><h1>Categories</h1>' +
      '<div class="sub" id="catSub">Loading…</div></div>' +
      '<div class="head-actions"><button class="btn primary" id="newCat">' + icon('plus') + 'New category</button></div>' +
      '</div>' +
      '<div id="catContainer">' + UI.spinner() + '</div>';

    root.querySelector('#newCat').addEventListener('click', function () { openEditor(root, null); });
    load(root);
  }

  function load(root) {
    var box = root.querySelector('#catContainer');
    box.innerHTML = UI.spinner();
    CC.API.get('/category').then(function (d) {
      var cats = (d && d.categories) || [];
      root.querySelector('#catSub').textContent = CC.num(cats.length) + ' categor' + (cats.length === 1 ? 'y' : 'ies');
      if (!cats.length) {
        box.innerHTML = UI.emptyState({ icon: 'layers', title: 'No categories', body: 'Create a category to organize your catalog.', actionLabel: 'New category', actionId: 'emptyNewCat' });
        var en = box.querySelector('#emptyNewCat'); if (en) en.addEventListener('click', function () { openEditor(root, null); });
        return;
      }
      box.innerHTML = '<div class="grid grid-4">' + cats.map(function (c) {
        var hidden = (c.status || 'show') !== 'show';
        var imgUrl = c.image || c.icon || '';
        return '<div class="panel" style="padding:0;overflow:hidden;display:flex;flex-direction:column">' +
          '<div class="panel-pad" style="display:flex;align-items:center;gap:14px;flex:1">' +
          (imgUrl
            ? '<div style="width:48px;height:48px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--near-black);flex:0 0 48px;display:grid;place-items:center">' +
                '<img src="' + esc(imgUrl) + '" alt="' + esc(locName(c.name, 'Category')) + '" style="width:100%;height:100%;object-fit:cover">' +
              '</div>'
            : '<div class="st-ic" style="width:48px;height:48px;border-radius:12px;flex:0 0 48px;display:grid;place-items:center;background:var(--lime-glow);color:var(--lime)">' + icon('layers') + '</div>'
          ) +
          '<div style="flex:1;min-width:0">' +
          '<div class="cell-strong" style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(locName(c.name, 'Category')) + '</div>' +
          '<div class="cell-sub" style="margin-top:3px">' + (hidden ? '<span class="badge neutral" style="font-size:9.5px;padding:2px 7px">Hidden</span>' : '<span class="badge ok" style="font-size:9.5px;padding:2px 7px"><i class="d"></i>Live</span>') + '</div>' +
          '</div></div>' +
          '<div class="prod-actions" style="padding:0 14px 14px;display:flex;gap:6px">' +
          '<button class="btn sm grow" data-edit="' + esc(c._id) + '">' + icon('edit') + 'Edit</button>' +
          '<button class="btn sm ghost" data-toggle="' + esc(c._id) + '" title="' + (hidden ? 'Show category' : 'Hide category') + '">' + icon(hidden ? 'eye' : 'eye-off') + '</button>' +
          '<button class="btn sm ghost danger" data-del="' + esc(c._id) + '" title="Delete category">' + icon('trash') + '</button>' +
          '</div></div>';
      }).join('') + '</div>';

      box.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = cats.find(function (x) { return x._id === b.getAttribute('data-edit'); });
          openEditor(root, c);
        });
      });
      box.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = cats.find(function (x) { return x._id === b.getAttribute('data-toggle'); });
          var next = (c && (c.status || 'show') === 'show') ? 'hide' : 'show';
          CC.API.put('/category/status/' + b.getAttribute('data-toggle'), { status: next })
            .then(function () { CC.toast('Category ' + (next === 'show' ? 'shown' : 'hidden')); load(root); })
            .catch(function (e) { CC.toast(e.message, 'bad'); });
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = cats.find(function (x) { return x._id === b.getAttribute('data-del'); });
          CC.confirmModal({ title: 'Delete category?', body: 'Delete "' + locName(c && c.name, 'this category') + '"? Products keep their reference but lose this label.', ok: 'Delete', danger: true })
            .then(function (ok) {
              if (!ok) return;
              CC.API.del('/category/' + b.getAttribute('data-del'))
                .then(function () { CC.toast('Category deleted'); load(root); })
                .catch(function (e) { CC.toast(e.message, 'bad'); });
            });
        });
      });
    }).catch(function (e) {
      box.innerHTML = UI.errorState(e.message, 'catRetry');
      var rt = box.querySelector('#catRetry'); if (rt) rt.addEventListener('click', function () { load(root); });
    });
  }

  function openEditor(root, c) {
    var isNew = !c;
    var currentImg = c ? (c.image || c.icon || '') : '';

    UI.openDrawer({
      title: isNew ? 'New category' : 'Edit category',
      sub: isNew ? 'Add a catalog category with image' : locName(c.name, ''),
      bodyHtml:
        '<div class="dsec"><div class="dsec-title">' + icon('image') + 'Category Image</div>' +
        '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">' +
        '<div id="catImgPreview" style="width:76px;height:76px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--near-black);display:grid;place-items:center;flex-shrink:0">' +
        (currentImg
          ? '<img src="' + esc(currentImg) + '" style="width:100%;height:100%;object-fit:cover">'
          : '<div style="color:var(--ink-4)">' + icon('image') + '</div>'
        ) +
        '</div>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<label class="btn sm primary" style="cursor:pointer" id="catUploadLabel">' +
        icon('upload') + ' Upload Image' +
        '<input type="file" id="catFileInput" accept="image/*" hidden>' +
        '</label>' +
        '<button type="button" class="btn sm ghost danger" id="catImgRemove" style="' + (currentImg ? '' : 'display:none;') + '">' +
        icon('trash') + ' Remove' +
        '</button>' +
        '</div>' +
        '<div class="hint" style="font-size:11px;color:var(--ink-3)">Upload from computer (Cloudinary) or paste image URL below.</div>' +
        '</div>' +
        '</div>' +
        '<div class="field"><label>Image URL</label>' +
        '<input class="input mono" id="cImageUrl" value="' + esc(currentImg) + '" placeholder="https://... or click Upload Image above"></div>' +
        '</div>' +

        '<div class="dsec"><div class="dsec-title">' + icon('layers') + 'Details</div>' +
        '<div class="field"><label>Name <span style="color:var(--bad)">*</span></label><input class="input" id="cName" value="' + esc(isNew ? '' : locName(c.name, '')) + '" placeholder="e.g. Rings, Necklaces, Bracelets"></div>' +
        '<div class="field"><label>Description</label><textarea class="input" id="cDesc" placeholder="Optional category description">' + esc(isNew ? '' : locName(c.description, '')) + '</textarea></div>' +
        '<div class="field"><label>Status</label><select class="select" id="cStatus">' +
        '<option value="show"' + (!isNew && (c.status || 'show') === 'show' ? ' selected' : (isNew ? ' selected' : '')) + '>Live (visible)</option>' +
        '<option value="hide"' + (!isNew && (c.status || 'show') === 'hide' ? ' selected' : '') + '>Hidden</option>' +
        '</select></div></div>',
      footHtml:
        '<button class="btn ghost" data-drawer-close>Cancel</button>' +
        '<button class="btn primary" id="saveCat">' + icon('save') + (isNew ? 'Create category' : 'Save changes') + '</button>',
      onMount: function (drawerEl, close) {
        var previewBox = drawerEl.querySelector('#catImgPreview');
        var urlInput = drawerEl.querySelector('#cImageUrl');
        var rmBtn = drawerEl.querySelector('#catImgRemove');
        var uploadLabel = drawerEl.querySelector('#catUploadLabel');

        function updatePreview() {
          var url = urlInput.value.trim();
          if (url) {
            previewBox.innerHTML = '<img src="' + esc(url) + '" style="width:100%;height:100%;object-fit:cover">';
            rmBtn.style.display = '';
          } else {
            previewBox.innerHTML = '<div style="color:var(--ink-4)">' + icon('image') + '</div>';
            rmBtn.style.display = 'none';
          }
        }

        urlInput.addEventListener('input', updatePreview);
        rmBtn.addEventListener('click', function () {
          urlInput.value = '';
          updatePreview();
        });

        function bindFileInput() {
          var fi = drawerEl.querySelector('#catFileInput');
          if (!fi) return;
          fi.addEventListener('change', function () {
            var file = fi.files && fi.files[0];
            if (!file) return;
            uploadLabel.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Removing BG...';
            CC.API.uploadProductImage(file).then(function (res) {
              var url = typeof res === 'string' ? res : (res && (res.url || res.secure_url || res.path));
              if (!url) throw new Error('Upload failed');
              urlInput.value = url;
              updatePreview();
              CC.toast('Category image uploaded', 'ok');
            }).catch(function (e) {
              CC.toast(e.message || 'Upload failed', 'bad');
            }).then(function () {
              uploadLabel.innerHTML = icon('upload') + ' Upload Image<input type="file" id="catFileInput" accept="image/*" hidden>';
              bindFileInput();
            });
          });
        }
        bindFileInput();

        drawerEl.querySelector('#saveCat').addEventListener('click', function () {
          var name = drawerEl.querySelector('#cName').value.trim();
          if (!name) { CC.toast('Category name is required', 'bad'); drawerEl.querySelector('#cName').focus(); return; }
          var imgUrl = urlInput.value.trim();
          var payload = {
            name: { en: name },
            description: { en: drawerEl.querySelector('#cDesc').value.trim() },
            status: drawerEl.querySelector('#cStatus').value,
            image: imgUrl,
            icon: imgUrl
          };
          var btn = drawerEl.querySelector('#saveCat'); btn.disabled = true;
          var req = isNew ? CC.API.post('/category/add', payload) : CC.API.put('/category/' + c._id, payload);
          req.then(function () {
            CC.toast(isNew ? 'Category created' : 'Category updated', 'ok');
            close(); load(root);
          }).catch(function (e) { CC.toast(e.message, 'bad'); btn.disabled = false; });
        });
      }
    });
  }

  global.Views.categories = { title: 'Categories', crumb: 'Categories', render: render };
})(window);
