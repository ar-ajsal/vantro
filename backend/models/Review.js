const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: false },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false },
  customerName: { type: String, trim: true },
  customerEmail: { type: String, trim: true },
  
  rating: { type: Number, min: 1, max: 5 },
  text: { type: String, trim: true },
  
  status: { 
    type: String, 
    enum: ['pending_submission', 'pending_moderation', 'approved', 'rejected'], 
    default: 'pending_submission' 
  },
  
  token: { type: String, sparse: true }, // For the secure one-time link or internal ref
  
}, { timestamps: true });

// Indexes for common queries
reviewSchema.index({ token: 1 }, { sparse: true });
reviewSchema.index({ productId: 1, status: 1 });
reviewSchema.index({ status: 1 });

module.exports = mongoose.model('Review', reviewSchema);

