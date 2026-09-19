/* ============================================================================
   CHROMVAULT — FRONT-END SERVER
   ----------------------------------------------------------------------------
   Two applications live here, on two ports:

     :3001  the customer storefront  (storefront/ — the buildless SPA)
     :3002  the admin Command Center (admin panel/command-center/)

   The storefront is mounted by exactly one of two functions, chosen once at
   boot from STOREFRONT_LEGACY:

     mountStorefront()        the new SPA. The default.
     mountLegacyStorefront()  the original HTTrack scrape of chromvault.in, kept
                              verbatim as a rollback path.

   They are mutually exclusive by construction rather than by route ordering, so
   there is no arrangement of environment variables that produces a half-new,
   half-old site — the failure mode that "just add the new routes above the old
   ones" invites.

   Rollback is one variable:  STOREFRONT_LEGACY=1 node frontendServer.js
   ========================================================================== */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

/* ── Configuration ───────────────────────────────────────────────────────────
   Nothing production-specific is hardcoded. Every value has a localhost default
   so `node frontendServer.js` works from a fresh clone. */

const PORT = parseInt(process.env.STOREFRONT_PORT, 10) || 3001;
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT, 10) || 3002;

// Where API calls are forwarded. Include the version segment.
const API_TARGET = (process.env.API_PROXY_TARGET || 'http://localhost:5000/v1').replace(/\/+$/, '');

/* What the browser is told to use as its API base, injected into the shell as
   window.__CHROMVAULT_API_BASE__ (see storefront/assets/js/config.js).

   The default is the relative '/v1', which this server proxies to API_TARGET.
   Same-origin means no preflight, no CORS_ORIGINS to keep in sync, and no
   chance of a mixed-content error behind TLS. Set STOREFRONT_API_BASE to an
   absolute URL only if the API is fronted separately — in which case the
   backend's CORS_ORIGINS must include the storefront origin. */
const STOREFRONT_API_BASE = process.env.STOREFRONT_API_BASE || '/v1';

const ADMIN_URL = process.env.ADMIN_URL || `http://localhost:${ADMIN_PORT}`;

const LEGACY = process.env.STOREFRONT_LEGACY === '1';

/* Optional. Absent is a supported state: checkout falls back to manual address
   entry, and the privacy page stops claiming Google receives anything. The key
   is read from the environment and injected at request time — never written
   into a shipped file. */
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

const IS_PROD = process.env.NODE_ENV === 'production';

const storefrontRoot = path.join(__dirname, '..', 'storefront');
const legacyRoot = path.join(__dirname, '..', 'https___chromvault.in_');
const legacySiteRoot = path.join(legacyRoot, 'chromvault.in');
const adminRoot = path.join(__dirname, '..', 'admin panel', 'command-center');

const app = express();
app.disable('x-powered-by');

/* ── Safe injection ──────────────────────────────────────────────────────────
   Config values reach the page inside a <script> block, and some of them come
   from environment variables an operator controls. JSON.stringify alone is not
   enough: a value containing "</script>" would close the block early. Escaping
   < > & as unicode escapes keeps the payload valid JSON and inert as HTML. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/* ── Storefront: the new SPA ───────────────────────────────────────────────── */

/* Customer route shapes. This mirrors the ROUTES table in
   storefront/js/app.js and exists for one reason: to answer with the right HTTP
   status. The SPA renders its own not-found view either way, but a crawler,
   a monitor and a browser's error console all deserve a real 404 rather than a
   200 on a URL that does not exist.

   backend/tests/storefront.test.js walks this list against a live server, so
   the two tables cannot silently drift apart. */
const CUSTOMER_ROUTES = [
  /^\/$/,
  /^\/shop\/?$/,
  /^\/product-category\/[^/]+\/?$/,
  /^\/collections\/[^/]+\/?$/,
  /^\/product\/id\/[^/]+\/?$/,
  /^\/product\/[^/]+\/?$/,
  /^\/cart\/?$/,
  /^\/checkout\/?$/,
  /^\/(?:track|order-tracking)\/?$/,
  /^\/(?:contact|contact-us)\/?$/,
  /^\/(?:shipping-policy|shipping)\/?$/,
  /^\/(?:returns|return-replacement-policy|returns-policy)\/?$/,
  /^\/(?:privacy|privacy-policy|privacy-policy-2)\/?$/,
  /^\/(?:terms|terms-conditions|terms-and-conditions)\/?$/,
  /^\/about\/?$/,
  /^\/review\/?$/
];

/* WordPress plumbing that the scrape exposed and the new site has no analogue
   for. 410 Gone (not 404) tells crawlers to drop these permanently, which is
   what we want for /feed and /wp-json. */
const RETIRED_PATHS = [
  /^\/wp-json(?:\/|$)/,
  /^\/wp-includes(?:\/|$)/,
  /^\/xmlrpc\.php$/i,
  /^\/wp-login\.php$/i,
  /^\/feed\/?$/,
  /^\/comments(?:\/|$)/,
  /^\/my-account(?:\/|$)/,
  /^\/\$\{i\}(?:\/|$)/          // an HTTrack artefact: a literal ${i} directory
];

function isCustomerRoute(pathname) {
  return CUSTOMER_ROUTES.some((re) => re.test(pathname));
}

/* A path that looks like a file must never be answered with HTML. Returning the
   SPA shell for a missing .js is how you get "Uncaught SyntaxError: Unexpected
   token '<'" and an hour of confusion. */
function looksLikeAsset(pathname) {
  return /\.[a-zA-Z0-9]{1,8}$/.test(pathname);
}

function readHtml(relativePath) {
  return fs.readFileSync(path.join(storefrontRoot, relativePath), 'utf8');
}

/* Contact details. config.js already ships the real published ones; these
   overrides exist so a staging deploy can point at a test inbox instead of the
   live one. Only keys actually set are sent, so a partial override merges
   rather than blanking the rest. */
function contactOverrides() {
  const map = {
    whatsapp: process.env.STOREFRONT_WHATSAPP,
    whatsappLabel: process.env.STOREFRONT_WHATSAPP_LABEL,
    email: process.env.STOREFRONT_EMAIL,
    instagram: process.env.STOREFRONT_INSTAGRAM
  };
  const out = {};
  Object.keys(map).forEach((k) => {
    if (map[k]) out[k] = String(map[k]).trim();
  });
  return out;
}

function injectConfig(html) {
  const lines = [];
  if (STOREFRONT_API_BASE) {
    lines.push(`window.__CHROMVAULT_API_BASE__=${jsonForScript(STOREFRONT_API_BASE)};`);
  }
  if (MAPS_KEY) {
    lines.push(`window.__CHROMVAULT_MAPS_KEY__=${jsonForScript(MAPS_KEY)};`);
  }
  const contact = contactOverrides();
  if (Object.keys(contact).length) {
    lines.push(`window.__CHROMVAULT_CONTACT__=${jsonForScript(contact)};`);
  }
  if (!lines.length) return html;

  // Must land before config.js runs, so immediately after <head>.
  const block = `<script>${lines.join('')}</script>`;
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + block)
    : block + html;
}

function sendVantroHtml(res, status, relativePath) {
  let html;
  try {
    const rawHtml = readHtml(relativePath);
    const apiBase = STOREFRONT_API_BASE ? `window.__CHROMVAULT_API_BASE__=${jsonForScript(STOREFRONT_API_BASE)};` : '';

    // earlyCapture: runs synchronously during HTML parsing (before any Shopify inline script)
    // so document.addEventListener(…, capture=true) here wins over all later Shopify listeners.
    const earlyCapture = `<script>
(function(){
  function readCart(){try{return JSON.parse(localStorage.getItem('cart')||'[]');}catch(e){return[];}}
  function writeCart(c){try{localStorage.setItem('cart',JSON.stringify(c));}catch(e){}}
  function isProductPage(){return window.location.pathname.startsWith('/products/');}
  function getQty(){var el=document.querySelector('.qty-number-input,[name=quantity],input[type=number]');return parseInt((el&&el.value)||'1',10)||1;}
  function getProduct(){
    if(window.__vantro_product__)return window.__vantro_product__;
    var slug=window.location.pathname.split('/').filter(Boolean).pop()||'';
    if(slug.endsWith('.html'))slug=slug.replace('.html','');
    var h1=document.querySelector('h1.product__title,.product__title h1,h1');
    var priceEl=document.querySelector('.price-current,.price-item--regular,[class*=price]');
    var priceNum=0;
    if(priceEl){
      var match=priceEl.innerText.replace(/,/g,'').match(/(\d+(?:\.\d+)?)/);
      if(match)priceNum=parseFloat(match[1]);
    }
    if(!priceNum){
      var metaPrice=document.querySelector('meta[property="og:price:amount"]');
      if(metaPrice)priceNum=parseFloat(metaPrice.content||'0');
    }
    var imgEl=document.querySelector('.slider-main img,.product__media img,meta[property="og:image"]');
    var imgSrc=(imgEl&&(imgEl.src||imgEl.content))||'';
    return{id:slug,title:h1?h1.innerText.trim():slug,price:priceNum,image:imgSrc};
  }
  function pushToCart(p,qty){
    if(!p)return;
    var cart=readCart(),existing=cart.find(function(i){return i.id===p.id;});
    if(existing){existing.quantity+=qty;}else{cart.push({id:p.id,title:p.title,price:p.price,image:p.image,quantity:qty});}
    writeCart(cart);
  }
  document.addEventListener('submit',function(e){
    if(!isProductPage())return;
    var f=e.target;
    var isAddForm=f&&(
      (f.id&&/productform|productpage/i.test(f.id))||
      f.classList.contains('shopify-product-form')||
      f.classList.contains('product-form')||
      (f.action&&f.action.indexOf('/cart/add')!==-1)||
      f.dataset.type==='add-to-cart-form'
    );
    if(!isAddForm)return;
    e.preventDefault();e.stopImmediatePropagation();
    pushToCart(getProduct(),getQty());
    window.location.href='/cart';
  },true);
  document.addEventListener('click',function(e){
    if(!isProductPage())return;
    var addBtn=e.target&&(e.target.classList.contains('btn-add-cart-outline')?e.target:(e.target.closest&&e.target.closest('.btn-add-cart-outline')));
    if(addBtn){
      e.preventDefault();e.stopImmediatePropagation();
      pushToCart(getProduct(),getQty());
      window.location.href='/cart';
      return;
    }
    var buyBtn=e.target&&(e.target.classList.contains('btn-buy-now-solid')?e.target:(e.target.closest&&e.target.closest('.btn-buy-now-solid')));
    if(buyBtn){
      e.preventDefault();e.stopImmediatePropagation();
      pushToCart(getProduct(),getQty());
      window.location.href='/checkout';
      return;
    }
  },true);
})();
<\/script>`;

    const antiFlicker = `<style>
      body:not(.vantro-loaded) main { opacity: 0 !important; }
      main { transition: opacity 0.3s ease-in-out; }
    </style>
    <script>setTimeout(function(){document.body.classList.add('vantro-loaded')}, 2500);</script>`;

    const inject = `${earlyCapture}\n<script>${apiBase}<\/script>\n<script src="/vantro-api.js" defer><\/script>\n${antiFlicker}`;
    
    html = /<head[^>]*>/i.test(rawHtml)
      ? rawHtml.replace(/<head[^>]*>/i, (m) => m + inject)
      : inject + rawHtml;
  } catch (err) {
    console.error('Storefront HTML is unreadable:', err.message);
    return res.status(500).type('txt').send('Storefront is misconfigured.');
  }
  res.status(status)
    .set('Cache-Control', 'no-store, must-revalidate')
    .type('html')
    .send(html);
}

function mountStorefront() {
  // 1. API proxy
  const apiRootTarget = (process.env.API_PROXY_TARGET || 'http://localhost:5000').replace(/\/v1\/?$/, '');
  app.use('/api', createProxyMiddleware({
    target: apiRootTarget,
    changeOrigin: true
  }));

  app.use('/v1', createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true
  }));

  // 2. Specific routes for the multi-page template
  app.get(['/', '/index.html'], (req, res) => sendVantroHtml(res, 200, 'index.html'));

  // Cart and Checkout: serve a clean minimal shell so Shopify's HTTrack scripts don't fire
  app.get(['/cart', '/cart/:item'], (req, res) => {
    const apiBase = STOREFRONT_API_BASE ? `window.__CHROMVAULT_API_BASE__=${jsonForScript(STOREFRONT_API_BASE)};` : '';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Bag — Vantro</title>
  <link href="/cdn/shop/t/10/assets/theme8ae7.css" rel="stylesheet">
  <script>${apiBase}<\/script>
  <script src="/vantro-api.js" defer><\/script>
  <style>
    body { margin: 0; padding-block-start: var(--header-height, 60px); font-family: var(--font-body, sans-serif); background: #fff; }
    #cart-shell { max-width: 860px; margin: 60px auto; padding: 0 24px; }
  <\/style>
</head>
<body>
  <header class="header-wrapper" style="position:fixed;top:0;left:0;right:0;z-index:200;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #f4f4f5;">
    <a href="/" style="text-decoration:none;color:#000;font-weight:700;font-size:18px;letter-spacing:.1em;">VANTRO</a>
    <a href="/" style="text-decoration:none;color:#71717a;font-size:12px;">Continue Shopping</a>
  </header>
  <main id="cart-shell">
    <h1 style="font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:32px;">Your Bag</h1>
    <div id="vantro-cart-root">Loading...</div>
  </main>
</body>
</html>`;
    res.status(200).set('Cache-Control', 'no-store').type('html').send(html);
  });

  app.get(['/checkout', '/checkout.html'], (req, res) => {
    const apiBase = STOREFRONT_API_BASE ? `window.__CHROMVAULT_API_BASE__=${jsonForScript(STOREFRONT_API_BASE)};` : '';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout — Vantro</title>
  <link href="/cdn/shop/t/10/assets/theme8ae7.css" rel="stylesheet">
  <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
  <script>${apiBase}<\/script>
  <script src="/vantro-api.js" defer><\/script>
  <style>
    body { margin: 0; padding-block-start: var(--header-height, 60px); font-family: var(--font-body, sans-serif); background: #fff; }
    #checkout-shell { max-width: 960px; margin: 60px auto; padding: 0 24px; }
    @media(min-width:768px){#chk-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;}}
    .chk-input { padding:14px; border:1px solid #e4e4e7; border-radius:4px; font-size:14px; width:100%; box-sizing:border-box; }
    .chk-input:focus { outline:2px solid #000; border-color:#000; }
    #btn-pay-now { background:#000; color:#fff; padding:16px; border:none; border-radius:4px; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; cursor:pointer; width:100%; margin-top:8px; }
    #btn-pay-now:disabled { opacity:0.6; cursor:not-allowed; }
  <\/style>
</head>
<body>
  <header style="position:fixed;top:0;left:0;right:0;z-index:200;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #f4f4f5;">
    <a href="/" style="text-decoration:none;color:#000;font-weight:700;font-size:18px;letter-spacing:.1em;">VANTRO</a>
    <a href="/cart" style="text-decoration:none;color:#71717a;font-size:12px;">← Back to Bag</a>
  </header>
  <main id="checkout-shell">
    <h1 style="font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:32px;">Checkout</h1>
    <div id="chk-grid">
      <div>
        <h2 style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:20px;">Delivery Details</h2>
        <form id="checkout-form" novalidate style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label for="chk-name" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Full Name *</label>
            <input id="chk-name" class="chk-input" type="text" placeholder="Full Name *" required>
          </div>
          <div>
            <label for="chk-phone" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Mobile Number *</label>
            <input id="chk-phone" class="chk-input" type="tel" placeholder="Mobile Number (10 digits) *" required pattern="[0-9]{10}" maxlength="10" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)">
          </div>
          <div>
            <label for="chk-email" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Email Address (Optional)</label>
            <input id="chk-email" class="chk-input" type="email" placeholder="Email Address (optional)">
          </div>
          <div>
            <label for="chk-street" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Address *</label>
            <input id="chk-street" class="chk-input" type="text" placeholder="House No / Street / Area *" required>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label for="chk-city" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">City *</label>
              <input id="chk-city" class="chk-input" type="text" placeholder="City *" required>
            </div>
            <div>
              <label for="chk-zip" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">PIN Code *</label>
              <input id="chk-zip" class="chk-input" type="tel" placeholder="PIN Code *" required pattern="[0-9]{6}" maxlength="6" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6)">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label for="chk-state" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">State *</label>
              <select id="chk-state" class="chk-input" required>
                <option value="" disabled selected>Select State *</option>
              </select>
            </div>
            <div>
              <label for="chk-district" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">District *</label>
              <select id="chk-district" class="chk-input" required>
                <option value="" disabled selected>Select District *</option>
              </select>
            </div>
          </div>
          <button id="btn-pay-now" type="submit">Pay Now</button>
        </form>
      </div>
      <div>
        <h2 style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:20px;">Order Summary</h2>
        <div id="checkout-summary-items"></div>
        <div style="margin-top:20px;padding-top:16px;border-top:2px solid #000;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;font-weight:700;text-transform:uppercase;">Total</span>
          <span id="checkout-total" style="font-size:20px;font-weight:700;">Rs. 0</span>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;
    res.status(200).set('Cache-Control', 'no-store').type('html').send(html);
  });
  
  app.get(['/products/:slug', '/products/:slug.html'], (req, res) => {
    sendVantroHtml(res, 200, 'products/template.html');
  });

  app.get(['/collections/:slug', '/collections/:slug.html'], (req, res) => {
    sendVantroHtml(res, 200, 'collections/template.html');
  });

  // 3. Static assets
  app.use(express.static(storefrontRoot, {
    index: false,
    redirect: false
  }));

  // 4. Catch-all fallback
  app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).type('txt').send('Method Not Allowed');
    }
    if (looksLikeAsset(req.path)) {
      return res.status(404).type('txt').send('Not Found');
    }
    sendVantroHtml(res, 404, 'index.html');
  });
}

/* ── Storefront: the legacy scrape (rollback only) ────────────────────────────
   Preserved as it was, including the WooCommerce hydration shims. Reachable
   only via STOREFRONT_LEGACY=1. Nothing in here is on the default path. */

function serveFixedHtml(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not Found');
  }
  let html = fs.readFileSync(filePath, 'utf8');

  if (STOREFRONT_API_BASE) {
    const inject = `<script>window.__CHROMVAULT_API_BASE__=${jsonForScript(STOREFRONT_API_BASE)};</script>`;
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => m + inject)
      : inject + html;
  }

  // Strip WooCommerce/Jetpack analytics: they throw a Webpack ChunkLoadError
  // against the scraped bundle and reload in a loop.
  html = html.replace(/<script[^>]*id=["']woocommerce-analytics-client-js["'][^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*id=["']woocommerce-analytics-js["'][^>]*><\/script>/gi, '');

  const dynamicProductsHtml = `
    <ul class="products columns-4" id="dynamic-products-container"></ul>
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        if (window.chromvaultAPI) {
          window.chromvaultAPI.renderProducts('#dynamic-products-container');
        }
      });
    </script>
  `;
  html = html.replace(/<ul class="products columns-4">[\s\S]*?<\/ul>/, dynamicProductsHtml);

  const singleProductScript = `
    <script>
      document.addEventListener('DOMContentLoaded', async () => {
        if (window.location.pathname.includes('/product/')) {
          const slug = window.location.pathname.split('/').filter(Boolean).pop();
          if (window.chromvaultAPI) {
            const product = await window.chromvaultAPI.fetchProductBySlug(slug);
            if (product) {
              const titleEl = document.querySelector('h1.product_title');
              if (titleEl) {
                  titleEl.innerText = (typeof product.title === 'object' ? product.title.en : product.title) || 'Product';
              }

              const price = product.prices?.price ?? product.price ?? 0;
              const originalPrice = product.prices?.originalPrice ?? product.originalPrice ?? price;
              const priceEl = document.querySelector('p.price');
              if (priceEl) {
                  priceEl.innerHTML = originalPrice > price
                    ? \`<del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#8377;</span>\${originalPrice}</bdi></span></del>
                       <ins><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#8377;</span>\${price}</bdi></span></ins>\`
                    : \`<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&#8377;</span>\${price}</bdi></span>\`;
              }

              const image = Array.isArray(product.image) ? product.image[0] : (product.image || '/wp-content/uploads/woocommerce-placeholder.png');
              const imgEl = document.querySelector('.woocommerce-product-gallery__image img, img.wp-post-image');
              if (imgEl) {
                  imgEl.src = image;
                  imgEl.srcset = '';
              }

              const productId = product._id || product.id || slug;

              const formCart = document.querySelector('form.cart');
              if (formCart) {
                  formCart.innerHTML = \`
                      <div style="display: flex; gap: 15px; width: 100%; margin-top: 20px;">
                          <a
                              href="#"
                              data-product_id="\${productId}"
                              class="button single_add_to_cart_button ajax_add_to_cart"
                              style="flex: 1; text-align: center; border-radius: 0; background-color: #fff; color: #000; border: 2px solid #000; text-transform: uppercase; font-weight: bold; padding: 15px; font-family: sans-serif; letter-spacing: 1px;"
                          >Add to Cart</a>
                          <a
                              href="/cart/"
                              data-product_id="\${productId}"
                              class="button single_buy_now_button"
                              style="flex: 1; text-align: center; border-radius: 0; background-color: #000; color: #fff; border: 2px solid #000; text-transform: uppercase; font-weight: bold; padding: 15px; font-family: sans-serif; letter-spacing: 1px;"
                          >Buy Now</a>
                      </div>
                  \`;
              }
            }
          }
        }
      });
    </script>
  `;
  html = html.replace('</body>', singleProductScript + '\n</body>');

  html = html.replace(/href=["']([^"']*?)index\.html["']/gi, (match, p1) => {
    if (p1 === '') return 'href="/"';
    return `href="${p1}"`;
  });

  res.set('Cache-Control', 'no-store').send(html);
}

function mountLegacyStorefront() {
  console.warn('⚠  STOREFRONT_LEGACY=1 — serving the archived scrape, not storefront/.');

  app.use('/assets', express.static(path.join(legacySiteRoot, 'assets')));
  app.use('/wp-content', express.static(path.join(legacySiteRoot, 'wp-content')));
  app.use('/wp-includes', express.static(path.join(legacySiteRoot, 'wp-includes')));

  app.get(['/', '/chromvault.in', '/chromvault.in/'], (req, res) => {
    serveFixedHtml(res, path.join(legacySiteRoot, 'index.html'));
  });

  app.get(['/shop', '/shop/', '/chromvault.in/shop', '/chromvault.in/shop/'], (req, res) => {
    serveFixedHtml(res, path.join(legacySiteRoot, 'shop', 'index.html'));
  });

  app.get(['/cart', '/cart/', '/chromvault.in/cart', '/chromvault.in/cart/'], (req, res) => {
    serveFixedHtml(res, path.join(legacySiteRoot, 'cart', 'index.html'));
  });

  app.get(['/contact-us', '/contact-us/', '/chromvault.in/contact-us', '/chromvault.in/contact-us/'], (req, res) => {
    const f = path.join(legacySiteRoot, 'contact-us', 'index.html');
    if (fs.existsSync(f)) return serveFixedHtml(res, f);
    serveFixedHtml(res, path.join(legacySiteRoot, 'index.html'));
  });

  ['shipping-policy', 'return-replacement-policy', 'privacy-policy-2', 'track'].forEach((page) => {
    app.get([`/${page}`, `/${page}/`, `/chromvault.in/${page}`, `/chromvault.in/${page}/`], (req, res) => {
      const f = path.join(legacySiteRoot, page, 'index.html');
      if (fs.existsSync(f)) return serveFixedHtml(res, f);
      serveFixedHtml(res, path.join(legacySiteRoot, 'index.html'));
    });
  });

  app.get([
    '/product-category/:cat', '/product-category/:cat/',
    '/chromvault.in/product-category/:cat', '/chromvault.in/product-category/:cat/'
  ], (req, res) => {
    const f = path.join(legacySiteRoot, 'product-category', req.params.cat, 'index.html');
    if (fs.existsSync(f)) return serveFixedHtml(res, f);
    serveFixedHtml(res, path.join(legacySiteRoot, 'shop', 'index.html'));
  });

  app.get([
    '/product/:slug', '/product/:slug/',
    '/chromvault.in/product/:slug', '/chromvault.in/product/:slug/'
  ], (req, res) => {
    serveFixedHtml(res, path.join(legacySiteRoot, 'product', 'template', 'index.html'));
  });

  app.use('/chromvault.in', express.static(legacySiteRoot));
  app.use(express.static(legacySiteRoot));
  app.use(express.static(legacyRoot));

  app.use((req, res, next) => {
    if (looksLikeAsset(req.path)) {
      return res.status(404).type('txt').send('Not Found');
    }
    next();
  });
  app.use((req, res) => {
    serveFixedHtml(res, path.join(legacySiteRoot, 'index.html'));
  });
}

/* ── Admin Command Center (unchanged) ────────────────────────────────────────
   Buildless single-page admin on its own port. Static assets from
   command-center/, /api proxied to the backend, and non-asset paths fall back
   to index.html so the hash router takes over. This app is deliberately
   untouched by the storefront migration. */
function startAdminServer() {
  const adminApp = express();
  adminApp.disable('x-powered-by');

  adminApp.use('/api', createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }
  }));

  adminApp.use(express.static(adminRoot));

  adminApp.use((req, res) => {
    if (looksLikeAsset(req.path)) {
      return res.status(404).type('txt').send('Not Found');
    }
    let html;
    try {
      html = fs.readFileSync(path.join(adminRoot, 'index.html'), 'utf8');
    } catch (err) {
      console.error('Admin shell is unreadable:', err.message);
      return res.status(500).type('txt').send('Admin panel is misconfigured.');
    }

    // Optional override; defaults to the same-origin "/api" proxy above.
    if (process.env.ADMIN_API_BASE) {
      const base = jsonForScript(process.env.ADMIN_API_BASE.replace(/\/+$/, ''));
      const inject = `<script>window.__ADMIN_API_BASE__=${base};</script>`;
      html = html.replace(/<head[^>]*>/i, (m) => m + inject);
    }
    res.set('Cache-Control', 'no-store').send(html);
  });

  return adminApp.listen(ADMIN_PORT, () => {
    console.log(`✅ Admin Panel (Command Center) running at ${ADMIN_URL}`);
  });
}

/* ── Boot ────────────────────────────────────────────────────────────────────
   Order matters only here: the admin redirect is registered before the
   storefront's catch-all so /admin never falls through to the SPA shell. */

startAdminServer();

app.use('/admin', (req, res) => res.redirect(ADMIN_URL));

if (LEGACY) mountLegacyStorefront();
else mountStorefront();

const server = app.listen(PORT, () => {
  const origin = `http://localhost:${PORT}`;
  console.log(`✅ Chromvault Storefront running at ${origin}`);
  console.log(`   Serving:      ${LEGACY ? 'legacy scrape (rollback mode)' : 'storefront/ (SPA)'}`);
  console.log(`   API base:     ${STOREFRONT_API_BASE}  →  ${API_TARGET}`);
  console.log(`   Google Maps:  ${MAPS_KEY ? 'key configured (address autocomplete on)' : 'not configured (manual address entry)'}`);
  console.log(`   Home:         ${origin}/`);
  console.log(`   Shop:         ${origin}/shop`);
  console.log(`   Product:      ${origin}/product/:slug`);
  console.log(`   Cart:         ${origin}/cart`);
  console.log(`   Checkout:     ${origin}/checkout`);
  console.log(`   Admin:        ${origin}/admin  →  ${ADMIN_URL}`);
});

module.exports = { app, server };
