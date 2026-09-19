const express = require('express');
const router = express.Router();
const {
  createCustomer,
  loginCustomer,
  getAllCustomers,
  getCustomerById
} = require('../controllers/customerController');
const { protectAdmin } = require('../middleware/authMiddleware');

// ─── Public ────────────────────────────────────────────────
router.post('/create', createCustomer); // registration
router.post('/login', loginCustomer);

// ─── Admin-only (contains customer PII) ────────────────────
router.get('/', protectAdmin, getAllCustomers);
router.get('/:id', protectAdmin, getCustomerById);

module.exports = router;
