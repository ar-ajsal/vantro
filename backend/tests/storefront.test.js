/**
 * Storefront routing tests — no database, no network, no browser.
 *
 * frontendServer.js decides three things that are easy to get quietly wrong and
 * expensive to debug in a browser:
 *
 *   1. Which paths return the SPA shell with 200, which return it with 404, and
 *      which return a bare 404. Serving HTML for a missing .js file is the
 *      classic "Unexpected token '<'" bug; serving 200 for a nonexistent route
 *      makes every URL look valid to a crawler.
 *   2. That runtime config is injected into the shell before config.js runs, and
 *      that the Google Maps key is only present when it is configured.
 *   3. That the retired WordPress surface and the old /chromvault.in/ prefix are
 *      handled rather than falling through to the SPA.
 *
 * It also asserts that the route table in frontendServer.js and the one in
 * storefront/js/app.js still agree — the two are separate lists and would
 * otherwise drift the first time a route is added to one of them.
 *
 * Run with:  node tests/storefront.test.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const base = path.join(__dirname, '..');
const repo = path.join(base, '..');

// Ports well away from the defaults so a running dev server does not collide.
process.env.STOREFRONT_PORT = process.env.STOREFRONT_PORT_TEST || '35311';
process.env.ADMIN_PORT = process.env.ADMIN_PORT_TEST || '35312';
process.env.NODE_ENV = 'test';
// Pin the injected values so assertions do not depend on the developer's .env.
process.env.STOREFRONT_API_BASE = '/v1';
process.env.VITE_GOOGLE_MAPS_API_KEY = 'test-maps-key-not-a-real-key';
delete process.env.STOREFRONT_LEGACY;

const PORT = parseInt(process.env.STOREFRONT_PORT, 10);

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${JSON.stringify(got)} want ${JSON.stringify(want)}]  ${name}`);
}

function get(p, method) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port: PORT, path: p, method: method || 'GET' },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: b
        }));
      }
    );
    r.on('error', (e) => resolve({ status: 'ERR:' + e.message, headers: {}, body: '' }));
    r.end();
  });
}

/* Reads the route regex sources out of both files textually. Comparing sources
   rather than behaviour is deliberate: it catches a route added to the SPA and
   forgotten on the server, which is exactly the drift that produces a 404 on a
   page that renders perfectly well. */
function serverRouteSources() {
  const src = fs.readFileSync(path.join(base, 'frontendServer.js'), 'utf8');
  const block = src.match(/const CUSTOMER_ROUTES = \[([\s\S]*?)\n\];/);
  if (!block) return null;
  return (block[1].match(/\/\^[^\n]*?\/(?=,|\s*$)/gm) || [])
    .map((s) => s.trim().replace(/,$/, ''));
}

function spaRouteSources() {
  const src = fs.readFileSync(path.join(repo, 'storefront', 'js', 'app.js'), 'utf8');
  const block = src.match(/var ROUTES = \[([\s\S]*?)\n  \];/);
  if (!block) return null;
  return (block[1].match(/re:\s*(\/\^.*?\/)(?=,)/g) || [])
    .map((s) => s.replace(/^re:\s*/, '').trim());
}

/* The two tables use different grouping styles for the same URLs — the SPA
   needs capture groups to read :slug and :category out of the match, the server
   only needs to know whether the shape is valid — so grouping syntax is dropped
   before comparing. What remains is the URL shape itself, which is the thing
   that has to agree. */
function normalise(re) {
  return re
    .replace(/\(\?:/g, '')
    .replace(/[()]/g, '')
    .replace(/\\\//g, '/')
    .replace(/\s+/g, '');
}

(async () => {
  // Requiring the module starts both servers as a side effect.
  const { server } = require(path.join(base, 'frontendServer.js'));
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));

  const isVantro = !fs.existsSync(path.join(repo, 'storefront', 'js', 'app.js'));

  if (isVantro) {
    const home = await get('/');
    check('GET / -> 200', home.status, 200);
    check('GET / is html', /^text\/html/.test(home.headers['content-type'] || ''), true);
    check('GET / is never cached', /no-store/.test(home.headers['cache-control'] || ''), true);
    check('shell injects API base', home.body.includes('window.__CHROMVAULT_API_BASE__="/v1"'), true);

    const cart = await get('/cart');
    check('GET /cart -> 200', cart.status, 200);
    check('GET /cart contains cart root', cart.body.includes('id="vantro-cart-root"'), true);

    const checkout = await get('/checkout');
    check('GET /checkout -> 200', checkout.status, 200);
    check('GET /checkout contains checkout form', checkout.body.includes('id="checkout-form"'), true);

    const product = await get('/products/black');
    check('GET /products/:slug -> 200', product.status, 200);
    check('product page injects earlyCapture', product.body.includes('pushToCart'), true);

    const js = await get('/vantro-api.js');
    check('GET /vantro-api.js -> 200', js.status, 200);
    check('vantro-api.js is served as javascript', /javascript/.test(js.headers['content-type'] || ''), true);

    const admin = await get('/admin');
    check('/admin -> 302', admin.status, 302);

    const posted = await get('/definitely-not-a-route', 'POST');
    check('POST to an unknown path -> 405', posted.status, 405);

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    process.exit(fail ? 1 : 0);
  }
  check('GET / is html', /^text\/html/.test(home.headers['content-type'] || ''), true);
  check('GET / is never cached', /no-store/.test(home.headers['cache-control'] || ''), true);
  check('shell injects API base', home.body.includes('window.__CHROMVAULT_API_BASE__="/v1"'), true);
  check('shell injects Maps key when configured',
    home.body.includes('window.__CHROMVAULT_MAPS_KEY__="test-maps-key-not-a-real-key"'), true);
  check('injection precedes config.js',
    home.body.indexOf('__CHROMVAULT_API_BASE__') < home.body.indexOf('assets/js/config.js'), true);
  check('shell is the SPA, not the scrape', home.body.includes('id="view"'), true);
  check('shell does not contain WooCommerce markup', /woocommerce/i.test(home.body), false);

  /* ── Customer routes: shell with 200 ───────────────────────────────────── */
  for (const p of [
    '/shop', '/shop/', '/shop?category=rings&sort=new',
    '/product/ch-belt-1', '/product/id/507f1f77bcf86cd799439011',
    '/product-category/rings', '/cart', '/checkout',
    '/track', '/order-tracking', '/contact', '/contact-us',
    '/shipping-policy', '/returns', '/return-replacement-policy',
    '/privacy', '/privacy-policy-2', '/terms', '/about'
  ]) {
    const r = await get(p);
    check(`GET ${p} -> 200 shell`, r.status === 200 && r.body.includes('id="view"'), true);
  }

  /* ── Deep links survive a refresh with their query intact ──────────────── */
  const deep = await get('/product-category/chains?sort=new&page=2');
  check('deep link with query -> 200', deep.status, 200);

  /* ── Unknown non-asset paths: shell, but an honest 404 ─────────────────── */
  const ghost = await get('/this-page-does-not-exist');
  check('unknown route -> 404', ghost.status, 404);
  check('unknown route still renders the shell', ghost.body.includes('id="view"'), true);

  /* ── Missing assets must never receive HTML ────────────────────────────── */
  for (const p of ['/js/nope.js', '/css/missing.css', '/img/gone.png', '/some/where/x.woff2']) {
    const r = await get(p);
    check(`missing asset ${p} -> 404`, r.status, 404);
    const r2 = await get(p);
    check(`missing asset ${p} is not html`, /html/.test(r2.headers['content-type'] || ''), false);
  }

  /* ── Real assets are served ────────────────────────────────────────────── */
  const css = await get('/css/tokens.css');
  check('GET /css/tokens.css -> 200', css.status, 200);
  check('css revalidates rather than caching hard',
    /no-cache/.test(css.headers['cache-control'] || ''), true);

  const app_js = await get('/js/app.js');
  check('GET /js/app.js -> 200', app_js.status, 200);
  check('js is served as javascript',
    /javascript/.test(app_js.headers['content-type'] || ''), true);

  const manifest = await get('/manifest.webmanifest');
  check('GET /manifest.webmanifest -> 200', manifest.status, 200);
  check('manifest parses', (() => {
    try { return typeof JSON.parse(manifest.body).name === 'string'; } catch (e) { return false; }
  })(), true);

  const icon = await get('/icon-192x192.png');
  check('GET /icon-192x192.png -> 200', icon.status, 200);

  const fav = await get('/favicon.ico');
  check('GET /favicon.ico -> 200', fav.status, 200);

  /* ── The service worker must be updatable ──────────────────────────────── */
  const sw = await get('/service-worker.js');
  check('GET /service-worker.js -> 200', sw.status, 200);
  check('service worker is not cached',
    /no-cache/.test(sw.headers['cache-control'] || ''), true);
  check('service worker may claim root scope',
    sw.headers['service-worker-allowed'], '/');
  check('service worker never caches /v1', sw.body.includes("indexOf('/v1') === 0"), true);
  check('service worker cache names are storefront-scoped',
    sw.body.includes("'chromvault-store-'"), true);
  /* The guard that keeps the admin PWA's caches alive. The storefront worker
     must refuse to delete any cache key that is not its own — asserted on the
     early-return itself, since a comment mentioning the admin is fine but a
     missing prefix check is not. */
  check('service worker cleanup is prefix-guarded',
    sw.body.includes('if (key.indexOf(PREFIX) !== 0) return null;'), true);
  check('service worker deletes nothing outside a caches.keys() prefix check',
    /caches\.delete\(/.test(sw.body) &&
    sw.body.indexOf('key.indexOf(PREFIX) !== 0') < sw.body.indexOf('caches.delete(key)'), true);

  /* ── Canonical URLs ────────────────────────────────────────────────────── */
  const legacyPrefix = await get('/chromvault.in/shop');
  check('/chromvault.in/shop -> 301', legacyPrefix.status, 301);
  check('/chromvault.in/shop -> /shop', legacyPrefix.headers.location, '/shop');

  const legacyQuery = await get('/chromvault.in/shop?category=rings');
  check('/chromvault.in/… keeps the query', legacyQuery.headers.location, '/shop?category=rings');

  const indexHtml = await get('/index.html');
  check('/index.html -> 301 /', indexHtml.status, 301);
  check('/index.html -> location /', indexHtml.headers.location, '/');

  /* ── Retired WordPress surface ─────────────────────────────────────────── */
  for (const p of ['/wp-json/wc/store/products', '/xmlrpc.php', '/feed', '/comments/feed']) {
    const r = await get(p);
    check(`retired ${p} -> 410`, r.status, 410);
  }
  const wpAdmin = await get('/wp-admin/');
  check('/wp-admin -> 302 to admin', wpAdmin.status, 302);

  /* ── The admin app is reachable and separate ────────────────────────────── */
  const admin = await get('/admin');
  check('/admin -> 302', admin.status, 302);

  /* ── Non-GET on an unknown path is not a shell ─────────────────────────── */
  const posted = await get('/definitely-not-a-route', 'POST');
  check('POST to an unknown path -> 405', posted.status, 405);

  /* ── Route tables agree ────────────────────────────────────────────────── */
  const srv = serverRouteSources();
  const spa = spaRouteSources();
  check('server route table is parseable', Array.isArray(srv) && srv.length > 0, true);
  check('SPA route table is parseable', Array.isArray(spa) && spa.length > 0, true);
  if (srv && spa) {
    check('route table lengths match', srv.length, spa.length);
    const a = srv.map(normalise).sort();
    const b = spa.map(normalise).sort();
    const diff = a.filter((x, i) => x !== b[i]);
    check(`route tables agree${diff.length ? ' (differs: ' + diff.join(' ') + ')' : ''}`,
      diff.length, 0);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
