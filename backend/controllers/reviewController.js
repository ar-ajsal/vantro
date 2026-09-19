const crypto = require('crypto');
const Review = require('../models/Review');
const Order = require('../models/Order');

// ============================================================================
// ADMIN CONTROLLERS
// ============================================================================

// POST /v1/admin/reviews/request/:orderId
exports.requestReview = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.body; // Specifically which product in the order

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    // Check if a review already exists
    const existing = await Review.findOne({ orderId, productId });
    if (existing) {
      if (existing.status === 'pending_submission') {
        return res.json({ message: 'Review request already generated', token: existing.token });
      }
      return res.status(400).json({ error: 'Review already submitted for this product' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    const review = await Review.create({
      orderId,
      productId,
      token,
      status: 'pending_submission'
    });

    res.json({ message: 'Review request generated', token: review.token });
  } catch (err) {
    console.error('requestReview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /v1/admin/reviews
exports.listReviewsAdmin = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = (!status || status === 'all') ? {} : { status };
    
    const reviews = await Review.find(filter)
      .populate('productId', 'title image')
      .populate('orderId', 'customerName customerEmail totalAmount createdAt')
      .sort({ createdAt: -1 });

    const allReviews = await Review.find({}).lean();
    const stats = {
      total: allReviews.length,
      pending: allReviews.filter(r => r.status === 'pending_moderation').length,
      approved: allReviews.filter(r => r.status === 'approved').length,
      rejected: allReviews.filter(r => r.status === 'rejected').length,
      pendingSubmission: allReviews.filter(r => r.status === 'pending_submission').length,
      avgRating: (
        allReviews.filter(r => r.rating).reduce((sum, r) => sum + r.rating, 0) /
        (allReviews.filter(r => r.rating).length || 1)
      ).toFixed(1)
    };
    
    res.json({ reviews, stats });
  } catch (err) {
    console.error('listReviewsAdmin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /v1/admin/reviews/:id/moderate
exports.moderateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved', 'rejected', or 'pending_moderation'

    if (!['approved', 'rejected', 'pending_moderation'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const review = await Review.findByIdAndUpdate(id, { status }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });

    res.json({ review });
  } catch (err) {
    console.error('moderateReview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /v1/reviews/:id
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findByIdAndDelete(id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ message: 'Review deleted successfully', id });
  } catch (err) {
    console.error('deleteReview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /v1/reviews/admin/create
exports.createReviewAdmin = async (req, res) => {
  try {
    const { customerName, customerEmail, rating, text, productId, status } = req.body;
    if (!customerName || !rating || !text) {
      return res.status(400).json({ error: 'Customer name, rating, and review text are required' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const review = await Review.create({
      customerName: customerName.trim(),
      customerEmail: (customerEmail || '').trim(),
      rating: Number(rating),
      text: text.trim(),
      productId: productId || null,
      status: status || 'approved',
      token
    });

    const populated = await Review.findById(review._id).populate('productId', 'title image');
    res.status(201).json({ message: 'Review created successfully', review: populated });
  } catch (err) {
    console.error('createReviewAdmin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ============================================================================
// PUBLIC CONTROLLERS
// ============================================================================

// GET /v1/reviews/validate/:token
exports.validateToken = async (req, res) => {
  try {
    const { token } = req.params;
    const review = await Review.findOne({ token }).populate('productId', 'title image');
    
    if (!review) return res.status(404).json({ error: 'Invalid or expired link' });
    if (review.status !== 'pending_submission') {
      return res.status(400).json({ error: 'Review already submitted' });
    }

    res.json({
      product: {
        id: review.productId._id,
        title: review.productId.title,
        image: review.productId.image && review.productId.image[0]
      }
    });
  } catch (err) {
    console.error('validateToken error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /v1/reviews/submit/:token
exports.submitReview = async (req, res) => {
  try {
    const { token } = req.params;
    const { rating, text } = req.body;

    const review = await Review.findOne({ token });
    if (!review) return res.status(404).json({ error: 'Invalid link' });
    if (review.status !== 'pending_submission') {
      return res.status(400).json({ error: 'Review already submitted' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    review.rating = rating;
    review.text = text;
    review.status = 'pending_moderation';
    await review.save();

    res.json({ message: 'Review submitted successfully' });
  } catch (err) {
    console.error('submitReview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /v1/products/:id/reviews
exports.getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const reviews = await Review.find({ productId: id, status: 'approved' })
      .populate('orderId', 'customerName')
      .sort({ updatedAt: -1 });

    const formattedReviews = reviews.map(r => ({
      id: r._id,
      rating: r.rating,
      text: r.text,
      customerName: r.customerName || (r.orderId ? r.orderId.customerName : 'Verified Buyer'),
      date: r.updatedAt
    }));

    res.json({ reviews: formattedReviews });
  } catch (err) {
    console.error('getProductReviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /v1/reviews/all
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ status: 'approved' })
      .populate('orderId', 'customerName')
      .populate('productId', 'title image')
      .sort({ updatedAt: -1 })
      .limit(30);

    const formattedReviews = reviews.map(r => {
      let productTitle = null;
      let productImage = null;
      if (r.productId) {
        // Handle localized title object or string
        productTitle = r.productId.title ? (r.productId.title.en || r.productId.title) : 'Product';
        productImage = r.productId.image && r.productId.image.length > 0 ? r.productId.image[0] : null;
      }
      return {
        id: r._id,
        rating: r.rating,
        text: r.text,
        customerName: r.customerName || (r.orderId ? r.orderId.customerName : 'Verified Buyer'),
        date: r.updatedAt,
        productTitle,
        productImage
      };
    });

    res.json({ reviews: formattedReviews });
  } catch (err) {
    console.error('getAllReviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
