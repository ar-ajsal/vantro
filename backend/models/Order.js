const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Customer Information (No user account required)
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: false },
  deliveryAddress: { type: Object, required: true }, // e.g., { street, city, state, zip, country }

  // Order Information
  orderId: { type: String, required: true, unique: true }, // Unique human-readable ID
  cart: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String },
    image: { type: String },
    variant: { type: String }, // Size/color if applicable
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 }
  }],
  subTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  total: { type: Number, default: 0 },

  // Payment Information (Razorpay is the only supported method)
  paymentMethod: { type: String, default: 'Razorpay' },
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
  paymentReference: { type: String, required: false }, // Razorpay payment id
  // Legacy field retained for backward compatibility with historical orders.
  paymentScreenshot: { type: String, required: false },

  // Order Status
  status: { 
    type: String, 
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out For Delivery', 'Delivered', 'Cancelled', 'Returned'], 
    default: 'Pending' 
  },

  // Shipping Information
  shippingDetails: {
    shipmentId: { type: String, required: false },
    awb: { type: String, required: false },
    courierName: { type: String, required: false },
    trackingUrl: { type: String, required: false },
    status: { type: String, required: false }
  },

  // Dates
  paymentDate: { type: Date, required: false },
  shippingDate: { type: Date, required: false },
  deliveryDate: { type: Date, required: false },

}, { timestamps: true });

// ─── Indexes for common queries ────────────────────────────
// Duplicate-payment guard looks up by paymentReference on every checkout.
// Sparse because legacy/pending orders may not have one; not unique because a
// blank/absent reference must not collide.
// Partial-UNIQUE so the same Razorpay payment can never create two orders even
// under a race (the check-then-save window is closed at the DB level). Partial
// so orders without a reference don't collide on null.
orderSchema.index(
  { paymentReference: 1 },
  { unique: true, partialFilterExpression: { paymentReference: { $type: 'string' } } }
);
// Admin list is sorted newest-first and filtered by status/paymentStatus.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
