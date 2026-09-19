const express = require('express');
const router = express.Router();
const {
  addProduct,
  addAllProducts,
  getAllProducts,
  getProductById, getProductBySlug,
  updateProduct,
  updateStatus,
  deleteProduct,
  reorderProducts
} = require('../controllers/productController');
const { protectAdmin } = require('../middleware/authMiddleware');

// ─── Public storefront reads ───────────────────────────────
router.get('/', getAllProducts);
router.get('/slug/:slug', getProductBySlug);

// ─── Admin-only reads/writes ───────────────────────────────
// Note: getProductById is POST /:id (the Dashtar SPA reads a single product via POST).
router.post('/add', protectAdmin, addProduct);
router.post('/all', protectAdmin, addAllProducts);
router.post('/:id', protectAdmin, getProductById);
router.patch('/:id', protectAdmin, updateProduct);
router.put('/reorder', protectAdmin, reorderProducts);
router.put('/status/:id', protectAdmin, updateStatus);
router.delete('/:id', protectAdmin, deleteProduct);

module.exports = router;

