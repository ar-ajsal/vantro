# DEPLOYMENT.md

## Architecture Overview

Two separate Vercel projects + AWS EC2 backend.

```
Browser
  ├── https://<storefront>.vercel.app  → Vercel proxy → AWS EC2 :5000/v1/*
  └── https://<admin>.vercel.app       → Vercel proxy → AWS EC2 :5000/v1/*
                                                              │
                                                         MongoDB Atlas
                                                         Cloudinary
                                                         Razorpay
```

---

## Step 1 — AWS EC2 Setup

### 1.1 Launch EC2 Instance
- Go to AWS Console → EC2 → Launch Instance
- Choose: **Ubuntu 22.04 LTS** (free tier eligible)
- Instance type: **t2.micro** (free tier) or **t3.small** for production
- Security Group — open these ports:
  - **22** (SSH) — your IP only
  - **5000** (Node.js API) — Anywhere (0.0.0.0/0)

### 1.2 Connect and Install Node.js
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (keeps server running after SSH disconnect)
sudo npm install -g pm2
```

### 1.3 Deploy Backend Code
```bash
# Clone your repo
git clone https://github.com/ar-ajsal/chromvault.git
cd chromvault/backend

# Install dependencies
npm install

# Create .env from the example
cp .env.example .env
nano .env   # fill in all values (see below)
```

### 1.4 Fill in the .env on EC2
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/chromvault?retryWrites=true&w=majority
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Firebase Cloud Messaging (Admin Order Push Notifications)
# Get from: Firebase Console -> Project Settings -> Service accounts -> Generate new private key
FIREBASE_PROJECT_ID=chromvault-f804e
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@chromvault-f804e.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Replace with your actual Vercel URLs after Step 2
CORS_ORIGINS=https://YOUR_STOREFRONT.vercel.app,https://YOUR_ADMIN.vercel.app
```

### 1.5 Start the Server with PM2
```bash
pm2 start server.js --name chromvault-api
pm2 startup    # auto-start on reboot
pm2 save
```

### 1.6 Note your EC2 Public IP
```bash
curl http://checkip.amazonaws.com
# e.g. 54.123.45.67
# Your backend URL is: http://54.123.45.67:5000
```

---

## Step 2 — Update vercel.json with your AWS URL

Before deploying to Vercel, replace the placeholder in both config files:

**`storefront/vercel.json`** — change:
```
"destination": "http://YOUR_AWS_EC2_IP:5000/v1/:path*"
```
to:
```
"destination": "http://54.123.45.67:5000/v1/:path*"
```

**`admin panel/command-center/vercel.json`** — same change.

Commit and push:
```bash
git add storefront/vercel.json "admin panel/command-center/vercel.json"
git commit -m "Set AWS backend URL in Vercel configs"
git push
```

---

## Step 3 — Deploy Storefront to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your **ar-ajsal/chromvault** GitHub repo
3. Set **Root Directory** to: `storefront`
4. Framework Preset: **Other**
5. Build Command: *(leave empty)*
6. Output Directory: `.`
7. Click **Deploy**

Your storefront URL: `https://chromvault-XXXX.vercel.app`

---

## Step 4 — Deploy Admin Panel to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) again (new project)
2. Import the **same** ar-ajsal/chromvault repo
3. Set **Root Directory** to: `admin panel/command-center`
4. Framework Preset: **Other**
5. Build Command: *(leave empty)*
6. Output Directory: `.`
7. Click **Deploy**

Your admin URL: `https://chromvault-admin-XXXX.vercel.app`

---

## Step 5 — Update CORS on EC2

Now that you have your Vercel URLs, update `/home/ubuntu/chromvault/backend/.env`:

```env
CORS_ORIGINS=https://chromvault-XXXX.vercel.app,https://chromvault-admin-XXXX.vercel.app
```

Restart:
```bash
pm2 restart chromvault-api
```

---

## Step 6 — Verify Everything Works

```bash
# 1. Check backend health
curl http://YOUR_EC2_IP:5000/health

# 2. Check via Vercel proxy (replace with your actual storefront URL)
curl https://YOUR_STOREFRONT.vercel.app/v1/products

# 3. Open storefront in browser — products should load
# 4. Open admin panel — login should work
# 5. Try a test Razorpay payment on the storefront
```

---

## Later — Switching to GoDaddy Custom Domain

When you're ready:

### On Vercel (for each project):
1. Go to Project Settings → Domains
2. Add your custom domain (e.g. `chromvault.in` for storefront, `admin.chromvault.in` for admin)
3. Vercel gives you a CNAME record to add to GoDaddy

### On GoDaddy:
1. Go to DNS Management
2. Add the CNAME records Vercel provides

### On EC2 (update .env):
```env
CORS_ORIGINS=https://chromvault.in,https://www.chromvault.in,https://admin.chromvault.in
```
```bash
pm2 restart chromvault-api
```

> **That's it.** No application code changes required — only configuration/DNS.

---

## Razorpay Domain Registration

Razorpay requires you to whitelist domains that initiate payments.

1. Go to Razorpay Dashboard → Settings → Website/App Details
2. Add both domains:
   - `https://YOUR_STOREFRONT.vercel.app` (temporary)
   - `https://chromvault.in` (when ready)

---

## Keeping the Backend Updated

When you push new code changes:
```bash
# On EC2
cd ~/chromvault
git pull
cd backend
npm install   # only if package.json changed
pm2 restart chromvault-api
```
