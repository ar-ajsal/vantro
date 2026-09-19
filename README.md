# Chromvault (chromvault)

Jewelry e-commerce platform: an Express + MongoDB backend, a static storefront,
and a React admin dashboard (Dashtar) plus a custom orders console.

## Architecture

- **backend/** — Express 5 API (base path `/v1`), Mongoose 9 models, JWT auth,
  Razorpay payments, Cloudinary uploads.
- **backend/frontendServer.js** — serves the static storefront (default port
  3001) and the admin panel (default port 3002), and proxies `/api` → backend.
- **https___chromvault.in_/** — static storefront (scraped WooCommerce HTML +
  hand-written glue JS in `assets/js/`).
- **admin panel/dashtar-admin.netlify.app/** — prebuilt React admin SPA
  (installable PWA) + custom vanilla-JS orders dashboard (`backend/custom-orders/`).

## Payment integrity (important)

The order total is **always** computed server-side from the database
(`backend/utils/pricing.js`). Client-supplied `price`, `discount`, and
`shippingFee` are ignored. An order is only persisted after a Razorpay signature
is verified. Razorpay is the **only** supported payment method (guest/COD/manual
UPI were removed).

## Prerequisites

- Node.js >= 18
- A MongoDB database (Atlas or self-hosted)
- Razorpay account (key id + secret)
- Cloudinary account (for product image uploads)

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill it in. **Never commit
`.env`** (it is gitignored).

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | no (default 5000) | API listen port |
| `MONGODB_URI` | **yes** | MongoDB connection string |
| `JWT_SECRET` | **yes** | Long random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLOUDINARY_URL` | for uploads | `cloudinary://api_key:api_secret@cloud_name` |
| `RAZORPAY_KEY_ID` | **yes** | Razorpay key id |
| `RAZORPAY_KEY_SECRET` | **yes** | Razorpay key secret (used for signature verification) |
| `RAZORPAY_WEBHOOK_SECRET` | optional | Only if you configure a Razorpay webhook |
| `CORS_ORIGINS` | **yes (prod)** | Comma-separated allowed origins (storefront + admin URLs), no trailing slash |

The server refuses to start if `JWT_SECRET` or `MONGODB_URI` is missing.

### Front-end server (`frontendServer.js`) — optional overrides

| Variable | Default | Description |
| --- | --- | --- |
| `STOREFRONT_PORT` | 3001 | Storefront listen port |
| `ADMIN_PORT` | 3002 | Admin panel listen port |
| `API_PROXY_TARGET` | `http://localhost:5000/v1` | Where `/api` is proxied (set to your backend, e.g. `https://api.chromvault.in/v1`) |
| `STOREFRONT_API_BASE` | (blank) | If set, injected as the storefront's API base (otherwise resolved same-origin `/v1`) |
| `ADMIN_API_BASE` | (blank) | Override the admin SPA API base (defaults to same-origin `/api`) |
| `ADMIN_URL` | `http://localhost:$ADMIN_PORT` | Public admin URL used for redirects |

## First-time setup

```bash
cd backend
npm install
cp .env.example .env          # then edit .env
node seedAdmin.js "Admin Name" admin@example.com "StrongPassword123"
```

Public admin registration is disabled; the first admin must be created with
`seedAdmin.js`. After that, a super admin can create more admins via the API.

## Running

### Development

```bash
cd backend
npm run dev          # API on :5000
node frontendServer.js   # storefront :3001, admin :3002, /api → :5000/v1
```

Visit `http://localhost:3001` (store) and `http://localhost:3002` (admin).

### Production

Run the API and the front-end server as separate long-lived processes (e.g.
under systemd, PM2, or a container). Set all required env vars. Put both behind
a reverse proxy that terminates TLS.

```bash
cd backend
NODE_ENV=production npm start        # API
NODE_ENV=production \
  API_PROXY_TARGET=https://api.chromvault.in/v1 \
  ADMIN_URL=https://admin.chromvault.in \
  node frontendServer.js
```

Recommended routing:

- Storefront domain → storefront server (:3001)
- Admin subdomain → admin server (:3002); its `/api` proxies to the backend
- Backend `/v1` reachable at the origin the storefront resolves to (same-origin
  `/v1` by default, or set `STOREFRONT_API_BASE` / `API_PROXY_TARGET`)

Set `CORS_ORIGINS` on the backend to exactly the storefront + admin origins.

## Health check

`GET /health` (and `/v1/health`) returns `200` with `{ status, uptime, db }`
when the DB is connected, `503` while it is not. Use it for load-balancer and
uptime probes.

## Tests

```bash
cd backend
npm test     # auth wiring + server-side pricing + controller HTTP semantics
```

Tests stub the database and network, so no live MongoDB is required.

## Admin PWA

The admin panel is installable (manifest + service worker at the admin origin
root). The service worker precaches the app shell and caches hashed build
assets, but **never** caches `/api` traffic, so admin data is always live.
