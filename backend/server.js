require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Fail fast if critical secrets are missing
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start. Copy backend/.env.example to backend/.env and fill it in.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('FATAL: MONGODB_URI is not set. Refusing to start.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// CORS: allow configured origins, Vercel deployments, localhost
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (no Origin header)
    if (!origin) return callback(null, true);

    // Allow if no CORS_ORIGINS configured or wildcard "*" present
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    try {
      const url = new URL(origin);
      const host = url.hostname;

      // Allow localhost and local IPs on any port
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') {
        return callback(null, true);
      }

      // Allow any Vercel deployment (*.vercel.app)
      if (host.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // Allow custom store domains
      if (host === 'chromvault.in' || host.endsWith('.chromvault.in')) {
        return callback(null, true);
      }

      // Check for wildcard pattern matching in allowedOrigins (e.g. *.yourdomain.com)
      for (const allowed of allowedOrigins) {
        if (allowed.startsWith('*.')) {
          const rootDomain = allowed.slice(2);
          if (host.endsWith('.' + rootDomain) || host === rootDomain) {
            return callback(null, true);
          }
        }
      }
    } catch (e) {}

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Lightweight request logging
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
}

// Health check
app.get(['/health', '/v1/health'], (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbConnected = dbState === 1;
  res.status(dbConnected ? 200 : 503).send({
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { family: 4 })
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Razorpay Standard Checkout API endpoints
const { createRazorpayOrder, verifyPaymentAndCreateOrder } = require('./controllers/orderController');
app.post('/api/create-order', createRazorpayOrder);
app.post('/api/verify-payment', verifyPaymentAndCreateOrder);

// Routes
app.use('/v1/admin', require('./routes/adminRoutes'));
app.use('/v1/products', require('./routes/productRoutes'));
app.use('/v1/category', require('./routes/categoryRoutes'));
app.use('/v1/customer', require('./routes/customerRoutes'));
app.use('/v1/cloudinary', require('./routes/uploadRoutes'));
app.use('/v1/orders', require('./routes/orderRoutes'));
app.use('/v1/reviews', require('./routes/reviewRoutes'));
app.use('/v1/settings', require('./routes/settingRoutes'));

app.get('/', (req, res) => {
  res.send('Chromvault Backend API is running...');
});

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).send({ message: 'Route not found.' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[error]', err && err.message ? err.message : err);
  if (err && /not allowed by CORS/.test(err.message || '')) {
    return res.status(403).send({ message: 'Origin not allowed.' });
  }
  res.status(500).send({ message: err ? err.message : 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : undefined;
app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST || 'localhost'}:${PORT}`);
});

module.exports = app;
