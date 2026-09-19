const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protectAdmin } = require('../middleware/authMiddleware');

// Admin routes (require authentication and admin role)
router.post('/request/:orderId', protectAdmin, reviewController.requestReview);
router.get('/admin', protectAdmin, reviewController.listReviewsAdmin);
router.post('/admin/create', protectAdmin, reviewController.createReviewAdmin);
router.put('/:id/moderate', protectAdmin, reviewController.moderateReview);
router.delete('/:id', protectAdmin, reviewController.deleteReview);

// Public routes
router.get('/validate/:token', reviewController.validateToken);
router.post('/submit/:token', reviewController.submitReview);
router.get('/all', reviewController.getAllReviews);
router.get('/:id', reviewController.getProductReviews);

module.exports = router;
