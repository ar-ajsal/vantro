const express = require('express');
const router = express.Router();
const {
  createRazorpayOrder,
  verifyPaymentAndCreateOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getDashboardAmount,
  getDashboardCount,
  getDashboardRecentOrder,
  getBestSellerChart,
  trackOrder
} = require('../controllers/orderController');

const { protectAdmin } = require('../middleware/authMiddleware');

// ─── Public storefront checkout (Razorpay only) ────────────
// Amounts are computed server-side; an order is only persisted after a
// verified Razorpay signature. (Guest/COD/manual-UPI checkout was removed.)
router.post('/create-order', createRazorpayOrder);
router.post('/create-razorpay-order', createRazorpayOrder);
router.post('/verify-payment', verifyPaymentAndCreateOrder);
router.get('/track/:orderId', trackOrder);

// ─── Admin-only: Dashboard Analytics ───────────────────────
router.get('/dashboard-amount', protectAdmin, getDashboardAmount);
router.get('/dashboard-count', protectAdmin, getDashboardCount);
router.get('/dashboard-recent-order', protectAdmin, getDashboardRecentOrder);
router.get('/best-seller/chart', protectAdmin, getBestSellerChart);

// ─── Admin-only: Orders Management (contains customer PII) ──
router.get('/', protectAdmin, getAllOrders);
router.get('/:id', protectAdmin, getOrderById);
router.put('/:id', protectAdmin, updateOrder);
router.delete('/:id', protectAdmin, deleteOrder);

module.exports = router;
