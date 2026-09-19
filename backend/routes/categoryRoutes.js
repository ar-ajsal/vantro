const express = require('express');
const router = express.Router();
const {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  updateStatus,
  deleteCategory
} = require('../controllers/categoryController');
const { protectAdmin } = require('../middleware/authMiddleware');

// ─── Public storefront reads ───────────────────────────────
router.get('/', getAllCategories); // handles /category and /category/all
router.get('/all', getAllCategories);
router.get('/:id', getCategoryById);

// ─── Admin-only writes ─────────────────────────────────────
router.post('/add', protectAdmin, addCategory);
router.put('/status/:id', protectAdmin, updateStatus);
router.put('/:id', protectAdmin, updateCategory);
router.delete('/:id', protectAdmin, deleteCategory);

module.exports = router;
