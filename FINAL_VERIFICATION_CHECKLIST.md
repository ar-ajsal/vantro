# Chromvault — Final Verification Checklist

Run before going live. Every item is tagged with how far verification has
already gone, so you know exactly what still needs your machine + accounts.

**Legend**
- ✅ **AUTO** — already verified by the automated test suite in this repo (no DB/network).
- 🔬 **LIVE-HERE** — I actually ran this against a booted server in the build sandbox (no real DB).
- 🖥️ **YOU-LOCAL** — you must run it locally against your real MongoDB/Razorpay/Cloudinary.
- 🔑 **YOU-EXTERNAL** — requires an action in an external account/dashboard (Atlas, Razorpay, Cloudinary, DNS/TLS).

> Honesty note: nothing that touches your real MongoDB Atlas, Razorpay, or
> Cloudinary account could be tested from the build environment (no outbound DB
> or account access). Those are all marked 🖥️/🔑 and are **NOT** claimed verified.

---

## 0. One-time setup

```bash
cd backend
npm install
cp .env.example .env        # then fill in real values (see item 20)
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run the automated suite (proves the ✅ AUTO items in one shot):

```bash
cd backend
npm test
```

Expected: `auth` 19 passed, `pricing` 11 passed, `controllers` 6 passed.

---

## 1. MongoDB Atlas connection — 🖥️ YOU-LOCAL + 🔑 YOU-EXTERNAL

🔑 In Atlas: create/confirm the DB user, and add your machine's IP (or `0.0.0.0/0`
for a first test) to **Network Access**. Put the SRV string in `MONGODB_URI`.

🖥️ Start the API and watch for the connect log:

```bash
cd backend
npm start
# expect: "MongoDB connected successfully"
# then in another terminal:
curl -s http://localhost:5000/health
# expect: {"status":"ok","db":"connected",...} with HTTP 200
```

🔬 Already confirmed here (with a deliberately unreachable URI): the server still
boots and `/health` correctly reports `503 {"status":"degraded","db":"disconnected"}`.
The **connected** path needs your real Atlas string.

---

## 2. Admin login — 🖥️ YOU-LOCAL

Create the first admin, then log in:

```bash
cd backend
node seedAdmin.js "Super Admin" admin@chromvault.in "StrongPass123!"

curl -s -X POST http://localhost:5000/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@chromvault.in","password":"StrongPass123!"}'
# expect: 200 + a JSON body containing "token"
```

Save the token:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@chromvault.in","password":"StrongPass123!"}' | \
  node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
echo "$TOKEN"
```

🖥️ Also test the browser flow: open the admin (`http://localhost:3002`), log in,
confirm you land on the dashboard.

Wrong-password check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@chromvault.in","password":"wrong"}'
# expect: 401
```

---

## 3. Admin authorization — ✅ AUTO + 🖥️ YOU-LOCAL

✅ Verified by `auth.test.js`: no token → 401; customer token on admin route → 403;
forged signature → 401; admin-type token with unknown id → 403.

🔬 Confirmed live here: `GET /v1/orders` with no token → `401 {"message":"Not authorized..."}`.

🖥️ Confirm against real data (protected route returns data **with** a valid token):

```bash
curl -s -o /dev/null -w "no-token: %{http_code}\n" http://localhost:5000/v1/orders           # expect 401
curl -s -o /dev/null -w "with-token: %{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/v1/orders                                                            # expect 200
```

---

## 4. Product CRUD — ✅ AUTO (semantics) + 🖥️ YOU-LOCAL (data)

✅ Verified by `controllers.test.js`: unknown slug → 404; unknown route → 404.

🖥️ Full round-trip against your DB:

```bash
# CREATE
curl -s -X POST http://localhost:5000/v1/products/add \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":{"en":"Test Ring"},"slug":"test-ring","prices":{"price":999},"stock":10,"image":["https://x/y.jpg"]}'
# expect: 201 + product with _id  → save the _id:
PID=<paste _id>

# READ (public list + public slug)
curl -s -o /dev/null -w "list: %{http_code}\n" http://localhost:5000/v1/products
curl -s -o /dev/null -w "slug: %{http_code}\n" http://localhost:5000/v1/products/slug/test-ring   # expect 200
curl -s -o /dev/null -w "bad-slug: %{http_code}\n" http://localhost:5000/v1/products/slug/nope     # expect 404

# READ one (admin, via POST /:id — Dashtar convention)
curl -s -o /dev/null -w "getById: %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/v1/products/$PID                                                          # expect 200

# UPDATE (PATCH)
curl -s -o /dev/null -w "update: %{http_code}\n" -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"stock":25}' http://localhost:5000/v1/products/$PID     # expect 200

# STATUS
curl -s -o /dev/null -w "status: %{http_code}\n" -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"hide"}' http://localhost:5000/v1/products/status/$PID  # expect 200

# DELETE
curl -s -o /dev/null -w "delete: %{http_code}\n" -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/v1/products/$PID                                                          # expect 200
curl -s -o /dev/null -w "invalid-id: %{http_code}\n" -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/v1/products/not-an-id                                                     # expect 400
```

🖥️ Also do the same CRUD through the admin UI to confirm the SPA is wired.

---

## 5. Customer data — ✅ AUTO + 🖥️ YOU-LOCAL

✅ Verified by `controllers.test.js`: registration validation (missing body / short
password / bad email) → 400; login with no body → 400.

🖥️ Confirm PII protection + no password leak against your DB:

```bash
# register a customer
curl -s -X POST http://localhost:5000/v1/customer/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"cust@test.com","password":"secret123"}'
# expect: 201 + token, NO password field

# customer list is admin-only and must never include password hashes
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/v1/customer | head -c 400; echo
# expect: 200, and grep should find nothing:
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/v1/customer | grep -c password
# expect: 0

# without token
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/v1/customer     # expect 401
```

---

## 6. Checkout — ✅ AUTO (pricing) + 🖥️ YOU-LOCAL (browser flow)

✅ Verified by `pricing.test.js`: totals come from the DB, client `price`/`discount`/
`shippingFee` are ignored, unknown products and insufficient stock are rejected,
empty cart rejected, bad quantity coerced.

🖥️ Browser flow (needs real Razorpay test keys — see item 7):
open the storefront (`http://localhost:3001`), add a product, open the cart drawer,
fill name/phone/address, and proceed. Verify:
- phone requires exactly 10 digits, PIN exactly 6 digits
- state is a searchable dropdown; district depends on state and resets when state changes
- the amount shown by Razorpay equals the DB-computed total (not any client value)

🖥️ Server-side amount check (no browser):

```bash
curl -s -X POST http://localhost:5000/v1/orders/create-razorpay-order \
  -H "Content-Type: application/json" \
  -d '{"cart":[{"_id":"<REAL_PRODUCT_ID>","quantity":2,"price":1}],"currency":"INR"}'
# expect: 200 + amount == (DB price * 2 * 100) paise, ignoring the client "price":1
# (this call reaches Razorpay, so it needs valid RAZORPAY_KEY_ID/SECRET)
```

---

## 7. Razorpay test payment — 🖥️ YOU-LOCAL + 🔑 YOU-EXTERNAL

🔑 Use **test-mode** keys from the Razorpay dashboard in `RAZORPAY_KEY_ID` /
`RAZORPAY_KEY_SECRET`.

🖥️ Complete a checkout in the browser using a Razorpay **test card**
(e.g. `4111 1111 1111 1111`, any future expiry/CVV). Confirm the success drawer appears.

> Cannot be tested here: the signature-verification code path is unit-covered
> indirectly, but a real signed payment requires your live Razorpay test account.

---

## 8. Order creation — 🖥️ YOU-LOCAL

🖥️ After a successful test payment, confirm the order persisted:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/v1/orders?limit=5" | head -c 800; echo
# expect: the new order with orderId "ORD-#####", full customer/address/cart/pricing,
#         paymentStatus "Paid", paymentReference set, status "Confirmed"
```

Verify every required field is present: `customerName`, `phone`, `deliveryAddress`
(street/city/district/state/zip), `cart[]` (name/price/quantity/image), `subTotal`,
`discount`, `shippingFee`, `total`, `paymentReference`, `paymentDate`.

---

## 9. Stock deduction — 🖥️ YOU-LOCAL

🖥️ Note a product's stock, place an order for it, then re-check:

```bash
# before (public read)
curl -s "http://localhost:5000/v1/products/slug/<slug>" | node -e "process.stdin.on('data',d=>console.log('stock',JSON.parse(d).stock))"
# ...place order for quantity N...
# after
curl -s "http://localhost:5000/v1/products/slug/<slug>" | node -e "process.stdin.on('data',d=>console.log('stock',JSON.parse(d).stock))"
# expect: after == before - N
```

Also confirm restock on cancel: set the order to `Cancelled` (item 13) and re-check
stock increases back.

---

## 10. Duplicate-order prevention — 🖥️ YOU-LOCAL

Two layers: an app-level check and a DB partial-unique index on `paymentReference`.

🖥️ Verify the index exists (mongosh against your DB):

```bash
mongosh "$MONGODB_URI" --quiet --eval 'db.orders.getIndexes()'
# expect an index on { paymentReference: 1 } with unique:true + partialFilterExpression
```

🖥️ Behavioral check: re-POST the same verify-payment payload (same
`razorpay_payment_id`) and confirm the server returns the existing order
("Order already recorded") instead of creating a second one. Then:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/v1/orders?search=<that_orderId>" \
  | node -e "process.stdin.on('data',d=>console.log('count',JSON.parse(d).totalDoc))"
# expect: 1 (not 2)
```

---

## 11. Payment verification — 🖥️ YOU-LOCAL

🖥️ Negative test — a tampered signature must be rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/v1/orders/verify-payment \
  -H "Content-Type: application/json" \
  -d '{"razorpay_order_id":"order_x","razorpay_payment_id":"pay_x","razorpay_signature":"bad",
       "customerName":"Test User","phone":"9876543210",
       "deliveryAddress":{"street":"1 Main","city":"Pune","district":"Pune","state":"Maharashtra","zip":"411001"},
       "cart":[{"_id":"<REAL_PRODUCT_ID>","quantity":1}]}'
# expect: 400 (invalid signature) — and NO order created
```

🖥️ Positive path is exercised by the real test payment in item 7.

---

## 12. Admin order visibility — 🖥️ YOU-LOCAL

🖥️ In the admin UI open **Orders** (`/orders`) and confirm the order appears with
correct customer, total, payment status, and status. API equivalent:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5000/v1/orders  # expect 200
```

🖥️ Dashboard analytics (real, not zeros):

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/v1/orders/dashboard-amount
# expect: non-zero totalOrderAmount once you have Paid orders; today/month buckets populated
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/v1/orders/best-seller/chart
# expect: bestSellingProduct[] reflecting real quantities sold
```

---

## 13. Admin order status changes — 🖥️ YOU-LOCAL

🖥️ From the order modal (or API), change status and confirm persistence + side effects:

```bash
OID=<order _id>
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"Shipped"}' http://localhost:5000/v1/orders/$OID  # expect 200
# Cancelling should restore stock (see item 9):
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"Cancelled"}' http://localhost:5000/v1/orders/$OID # expect 200
```

Also set tracking (courier/AWB/URL) from the modal and confirm it saves.

---

## 14. Cloudinary upload — 🖥️ YOU-LOCAL + 🔑 YOU-EXTERNAL

🔑 Put a valid `CLOUDINARY_URL` in `.env`.

🖥️ Upload is admin-only:

```bash
# no token → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/v1/cloudinary   # expect 401
# with token + a file → 200 + a cloudinary URL string
curl -s -X POST http://localhost:5000/v1/cloudinary \
  -H "Authorization: Bearer $TOKEN" -F "file=@/path/to/local-image.jpg"
# expect: 200 + "https://res.cloudinary.com/.../chromvault/..."
```

🖥️ Also add a product image via the admin UI uploader and confirm it renders.

> Cannot be tested here: needs your Cloudinary credentials.

---

## 15. Storefront API — 🖥️ YOU-LOCAL

🖥️ With both servers running, confirm the storefront talks to the backend:

```bash
# storefront serves config.js and pages
curl -s -o /dev/null -w "config.js: %{http_code}\n" http://localhost:3001/assets/js/config.js  # expect 200
curl -s -o /dev/null -w "home: %{http_code}\n" http://localhost:3001/                          # expect 200
# products list (direct backend)
curl -s -o /dev/null -w "products: %{http_code}\n" http://localhost:5000/v1/products           # expect 200
```

🖥️ In the browser (DevTools → Network), load the shop and confirm requests hit the
resolved API base and products render. On localhost the base resolves to
`http://localhost:5000/v1` automatically.

---

## 16. Admin API — 🔬 LIVE-HERE (proxy shape) + 🖥️ YOU-LOCAL

🔬 Confirmed here: the admin bundle's axios baseURL is `window.__ADMIN_API_BASE__ || "/api"`
(0 `localhost:5000` references remain).

🖥️ Confirm the same-origin `/api` proxy reaches the backend:

```bash
# admin server proxies /api → backend /v1
curl -s -o /dev/null -w "admin proxy: %{http_code}\n" http://localhost:3002/api/products   # expect 200
# custom orders dashboard is served
curl -s -o /dev/null -w "orders dash: %{http_code}\n" http://localhost:3002/orders/         # expect 200
```

🖥️ In the browser, confirm admin pages load data through `/api` (Network tab).

---

## 17. PWA installation — 🖥️ YOU-LOCAL

🖥️ Serve the admin over the front-end server, open in Chrome, and check:

```bash
curl -s -o /dev/null -w "manifest: %{http_code}\n" http://localhost:3002/manifest.webmanifest  # expect 200
curl -s -o /dev/null -w "sw: %{http_code}\n" http://localhost:3002/service-worker.js            # expect 200
curl -s -o /dev/null -w "icon: %{http_code}\n" http://localhost:3002/icon-192x192.png           # expect 200
```

In Chrome DevTools → **Application**:
- Manifest: name "Chromvault Admin", theme/background `#000000`, icons listed.
- Service Workers: `service-worker.js` is "activated and running".
- An install icon appears in the address bar; install and launch as a standalone window.

> Note: installability requires a **secure context** — `localhost` counts, but in
> production it must be served over **HTTPS** (item 20/deploy).
> The current PWA icons are generated placeholders (white "C" on black); swap in
> real artwork by replacing `admin panel/.../icon-*.png` if desired.

---

## 18. Mobile responsiveness — 🖥️ YOU-LOCAL (manual)

Not automatable here. In Chrome DevTools device toolbar (or a real phone on your LAN):
- Storefront: home, shop, product page, and the cart/checkout drawer — confirm layout,
  tap targets, and the state/district/PIN inputs work at 360–414px widths.
- Admin: dashboard, products, orders, and the order modal.

No storefront UI changes were made; this is a visual confirmation only.

---

## 19. CORS — 🔬 LIVE-HERE + 🖥️ YOU-LOCAL

🔬 Confirmed here (server booted with `CORS_ORIGINS=https://chromvault.in`):
- Allowed origin → response carries `Access-Control-Allow-Origin: https://chromvault.in`.
- Disallowed origin → **no** `Access-Control-Allow-Origin` header and the request is rejected (403).

🖥️ Repeat with your real origins:

```bash
# allowed
curl -s -D - -o /dev/null -H "Origin: https://chromvault.in" http://localhost:5000/ | grep -i access-control-allow-origin
# disallowed → no ACAO header
curl -s -D - -o /dev/null -H "Origin: https://evil.example" http://localhost:5000/ | grep -i access-control-allow-origin || echo "blocked (no ACAO)"
```

Set `CORS_ORIGINS` to exactly your storefront + admin origins (comma-separated, no trailing slash).

---

## 20. Production environment variables — 🖥️ YOU-LOCAL + 🔑 YOU-EXTERNAL

🖥️ Fail-fast is confirmed by code: the API refuses to start without `JWT_SECRET`
or `MONGODB_URI`. Verify locally:

```bash
cd backend
# missing secret → process exits with a FATAL message
JWT_SECRET= MONGODB_URI="mongodb://x" node server.js ; echo "exit=$?"   # expect FATAL + non-zero exit
```

Required in production (`backend/.env`):

```
PORT=5000
MONGODB_URI=<atlas srv string>
JWT_SECRET=<64+ hex chars>
CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>
RAZORPAY_KEY_ID=<live-or-test key id>
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=          # only if you add a webhook
CORS_ORIGINS=https://chromvault.in,https://admin.chromvault.in
NODE_ENV=production
```

Front-end server (if not co-located): `API_PROXY_TARGET`, `ADMIN_URL`, and
optionally `STOREFRONT_API_BASE` / `ADMIN_API_BASE` (see README).

🔑 **Rotate anything that ever lived in git history**: MongoDB Atlas password,
Cloudinary API secret, Razorpay key + secret. Confirm `.env` is gitignored:

```bash
git check-ignore backend/.env    # expect: backend/.env  (i.e. it IS ignored)
git ls-files | grep -c "\.env$"  # expect: 0
```

---

## 21. Health endpoint — 🔬 LIVE-HERE + 🖥️ YOU-LOCAL

🔬 Confirmed here:
- DB **disconnected** → `GET /health` and `GET /v1/health` return **503**
  `{"status":"degraded","db":"disconnected"}`.
- `GET /` → 200; unknown route → 404 `{"message":"Route not found."}`.

🖥️ Confirm the **connected** state against your Atlas DB:

```bash
curl -s -w " HTTP %{http_code}\n" http://localhost:5000/health
# expect: {"status":"ok","db":"connected",...} HTTP 200
```

Point your load balancer / uptime monitor at `/health`.

---

## Summary of what is and isn't verified

**✅ Verified by automated tests (here):**
- Route authorization matrix (item 3) — `auth.test.js`
- Server-side pricing / payment-amount integrity (items 6 pricing) — `pricing.test.js`
- HTTP semantics: slug 404, unknown-route 404, registration/login validation (items 4, 5) — `controllers.test.js`

**🔬 Verified by live testing in the build sandbox (no real DB):**
- Health endpoint degraded/503 + 200 on `/`, 404 on unknown route (item 21)
- CORS allow/deny header behavior (item 19)
- Auth gating returns 401 without a token (item 3)
- Admin bundle API base is `/api`, not localhost (item 16)

**🖥️ Requires your local machine (real MongoDB/Razorpay/Cloudinary):**
- Items 1 (connected), 2, 4 (data), 6 (browser), 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 (browser), 17, 18, 19 (real origins), 20 (fail-fast local), 21 (connected)

**🔑 Requires an external account/action:**
- Atlas IP allowlist + DB user (1), Razorpay test keys (7), Cloudinary credentials (14),
  credential rotation + HTTPS/TLS for PWA and production (17, 20)

Nothing above is marked verified unless it was actually run.
