const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { computeOrderPricing } = require('../utils/pricing');
const notificationService = require('../services/notificationService');


const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

// 1. Create Razorpay Order
// Supports both direct amount (in paise, >= 100) and storefront cart calculation.
const createRazorpayOrder = async (req, res) => {
    try {
    const { cart, currency = 'INR', amount, receipt, deliveryAddress } = req.body;
    let orderAmountPaise;

    if (cart && Array.isArray(cart) && cart.length > 0) {
      // Storefront flow: compute pricing server-side from the DB
      const pricing = await computeOrderPricing(cart);
      if (pricing.error) {
        return res.status(400).send({ message: pricing.error });
      }
      if (!pricing.total || pricing.total <= 0) {
        return res.status(400).send({ message: 'Invalid order amount' });
      }
      orderAmountPaise = Math.round(pricing.total * 100);
    } else if (amount !== undefined && amount !== null) {
      // Standard API flow: amount provided directly in paise
      const parsed = Number(amount);
      if (isNaN(parsed) || parsed < 100) {
        return res.status(400).send({ message: 'Amount must be at least 100 paise (₹1.00).' });
      }
      orderAmountPaise = Math.round(parsed);
    } else {
      return res.status(400).send({ message: 'Either amount (in paise) or cart items must be provided.' });
    }

    if (orderAmountPaise < 100) {
      return res.status(400).send({ message: 'Amount must be at least 100 paise (₹1.00).' });
    }

    // --- Strict Frontend Pre-Payment Validation ---
    if (deliveryAddress && deliveryAddress.zip) {
      if (!/^\d{6}$/.test(deliveryAddress.zip)) {
        return res.status(400).send({ message: 'Invalid 6-digit Pincode.' });
      }
      try {
        const pinRes = await fetch(`https://api.postalpincode.in/pincode/${deliveryAddress.zip}`);
        const pinData = await pinRes.json();
        if (pinData && pinData[0] && pinData[0].Status === 'Success' && pinData[0].PostOffice) {
          const pinState = pinData[0].PostOffice[0].State;
          const pinDist = pinData[0].PostOffice[0].District;
          const sState = (deliveryAddress.state || '').toLowerCase();
          const pState = pinState.toLowerCase();
          const stateMismatch = !pState.includes(sState) && !sState.includes(pState);
          if (stateMismatch) {
             return res.status(400).send({ message: `PIN code mismatch: PIN belongs to ${pinState}. Please verify your State.` });
          }
        } else if (pinData && pinData[0] && pinData[0].Status === 'Error') {
           return res.status(400).send({ message: 'Invalid Indian Pincode provided.' });
        }
      } catch(err) {
        console.log('PIN validation API failed during create order (ignored due to network):', err.message);
      }
    }

    let razorpay;
    try {
      razorpay = getRazorpayInstance();
    } catch (configErr) {
      return res.status(500).send({ message: configErr.message });
    }

    const options = {
      amount: orderAmountPaise,
      currency: currency || 'INR',
      receipt: receipt || `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.status(200).send({
      order_id: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    if (err && (err.statusCode === 401 || (err.error && err.error.code === 'BAD_REQUEST_ERROR' && /auth/i.test(err.error.description || '')))) {
      return res.status(401).send({ message: 'Razorpay authentication failed. Verify API keys.' });
    }
    const statusCode = (err && err.statusCode) ? err.statusCode : 500;
    res.status(statusCode).send({
      message: (err && err.error && err.error.description) || err.message || 'Error creating Razorpay order.'
    });
  }
};

// Helper: Generate a human-readable order ID.
// Count-based numbering can collide under concurrency, so the caller saves
// inside a retry loop; here we just derive the next candidate from the max
// existing number to reduce collisions.
const generateOrderId = async () => {
  const last = await Order.findOne({ orderId: /^ORD-\d+$/ })
    .sort({ createdAt: -1 })
    .select('orderId')
    .lean();
  let next = 10001;
  if (last && last.orderId) {
    const n = parseInt(last.orderId.replace('ORD-', ''), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `ORD-${next}`;
};

// Helper: Deduct Stock
const deductStock = async (cart) => {
  for (let item of cart) {
    const id = item.productId || item._id;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      try {
        await Product.findByIdAndUpdate(id, { $inc: { stock: -item.quantity } });
      } catch(e) { /* skip legacy products */ }
    }
  }
};

// Helper: Restore Stock
const restoreStock = async (cart) => {
  for (let item of cart) {
    const id = item.productId || item._id;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      try {
        await Product.findByIdAndUpdate(id, { $inc: { stock: item.quantity } });
      } catch(e) { /* skip legacy products */ }
    }
  }
};

// NOTE: Guest / COD / manual-UPI checkout was intentionally REMOVED.
// Business decision: Razorpay is the only supported payment flow. Placing an
// order without a verified Razorpay payment (and its signature) is no longer
// possible, which removes an unauthenticated order-injection path.

// 2. Verify Payment & Create MongoDB Order (For Razorpay)
const verifyPaymentAndCreateOrder = async (req, res) => {
  try {
    const razorpay_order_id = req.body.razorpay_order_id || req.body.order_id;
    const razorpay_payment_id = req.body.razorpay_payment_id || req.body.payment_id;
    const razorpay_signature = req.body.razorpay_signature || req.body.signature;
    const {
      customerName, phone, email, deliveryAddress,
      cart
    } = req.body;

    // Validate required fields for payment signature verification
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).send({
        success: false,
        message: 'Missing required payment verification fields. razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.'
      });
    }

    // Verify HMAC SHA256 signature
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(500).send({ success: false, message: 'Payment verification is not configured. RAZORPAY_KEY_SECRET is missing.' });
    }
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).send({ success: false, message: 'Invalid payment signature! Transaction verification failed.' });
    }

    // If pure payment verification request (no storefront cart / customer payload provided)
    if (!cart && !customerName) {
      return res.status(200).send({
        success: true,
        message: 'Payment verified successfully.',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id
      });
    }

    // Backend strict validation for storefront customer orders
    if (!customerName || customerName.trim().length < 3) {
      return res.status(400).send({ message: 'Invalid customer name.' });
    }
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).send({ message: 'Invalid 10-digit Indian phone number.' });
    }
    if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.state || !deliveryAddress.district || !deliveryAddress.zip) {
      return res.status(400).send({ message: 'Incomplete delivery address. Street, city, district, state, and zip are required.' });
    }
    if (!/^\d{6}$/.test(deliveryAddress.zip)) {
      return res.status(400).send({ message: 'Invalid 6-digit Pincode.' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).send({ message: 'Invalid email address format.' });
    }

    // Backend PIN code API Verification
    try {
      const pinRes = await fetch(`https://api.postalpincode.in/pincode/${deliveryAddress.zip}`);
      const pinData = await pinRes.json();
      if (pinData && pinData[0] && pinData[0].Status === 'Success' && pinData[0].PostOffice) {
        const pinState = pinData[0].PostOffice[0].State;
        const pinDist = pinData[0].PostOffice[0].District;
        
        const sState = deliveryAddress.state.toLowerCase();
        const sDist = deliveryAddress.district.toLowerCase();
        const pState = pinState.toLowerCase();
        const pDist = pinDist.toLowerCase();

        const stateMismatch = !pState.includes(sState) && !sState.includes(pState);

        if (stateMismatch) {
           return res.status(400).send({ message: `PIN code mismatch: PIN belongs to ${pinState}. Please verify your State.` });
        }
      } else if (pinData && pinData[0] && pinData[0].Status === 'Error') {
         return res.status(400).send({ message: 'Invalid Indian Pincode provided.' });
      }
    } catch(err) {
      console.log('PIN validation API failed in backend (ignored due to network):', err.message);
    }

    // Prevent duplicate orders for same payment
    const existingOrder = await Order.findOne({ paymentReference: razorpay_payment_id });
    if (existingOrder) {
      return res.status(200).send({ success: true, message: 'Order already recorded.', order: existingOrder });
    }

    // Authoritative pricing: recompute subtotal/discount/shipping/total from the
    // DB using the SAME helper that priced the Razorpay order. Unknown products
    // are rejected here rather than billed at a client-supplied price.
    const pricing = await computeOrderPricing(cart);
    if (pricing.error) {
      return res.status(400).send({ message: pricing.error });
    }

    // Persist with a small retry loop. Two things can race:
    //   - orderId (count-derived) can collide → regenerate and retry
    //   - paymentReference is partial-UNIQUE → a concurrent duplicate throws
    //     E11000; we treat that as "already recorded" and return the winner.
    let newOrder = null;
    let saveErr = null;
    for (let attempt = 0; attempt < 5 && !newOrder; attempt++) {
      const candidate = new Order({
        customerName, phone, email, deliveryAddress,
        orderId: await generateOrderId(),
        cart: pricing.lineItems,
        subTotal: pricing.subTotal,
        discount: pricing.discount,
        shippingFee: pricing.shippingFee,
        total: pricing.total,
        paymentMethod: 'Razorpay',
        paymentStatus: 'Paid',
        paymentReference: razorpay_payment_id,
        paymentDate: new Date(),
        status: 'Confirmed'
      });
      try {
        await candidate.save();
        newOrder = candidate;
      } catch (e) {
        saveErr = e;
        if (e && e.code === 11000) {
          // Duplicate key. If it's the payment reference, another request won
          // the race — return that order. If it's the orderId, retry.
          const dup = await Order.findOne({ paymentReference: razorpay_payment_id });
          if (dup) {
            return res.status(200).send({ success: true, message: 'Order already recorded.', order: dup });
          }
          continue; // orderId collision → regenerate
        }
        throw e; // unexpected error
      }
    }

    if (!newOrder) {
      throw saveErr || new Error('Could not persist order after multiple attempts.');
    }

    await deductStock(pricing.lineItems);

    // Phase 7 & 8: Real-time push notification to active admin devices.
    // Safe asynchronous dispatch — never blocks or disrupts customer order response.
    notificationService.sendNewOrderNotification(newOrder).catch((err) => {
      console.error('[Notification] Error dispatching order push notification:', err.message);
    });

    res.status(201).send({
      success: true,
      message: 'Payment verified and order placed successfully!',
      order: newOrder
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).send({ message: err.message });
  }
};

// Helper for backward compatibility with React SPA (Dashtar)
const mapToAdminSchema = (order) => {
  const o = order.toObject ? order.toObject() : order;
  return {
    ...o,
    invoice: o.invoice || (o.orderId ? o.orderId.replace('ORD-', '') : Math.floor(Math.random() * 10000)),
    shippingCost: o.shippingFee || o.shippingCost || 0,
    shippingOption: o.shippingDetails?.courierName || "Standard Delivery",
    userInfo: o.userInfo || {
      name: o.customerName || "N/A",
      contact: o.phone || "N/A",
      email: o.email || "N/A",
      address: o.deliveryAddress?.street || o.deliveryAddress?.address || "",
      city: o.deliveryAddress?.city || "",
      country: o.deliveryAddress?.country || "",
      zipCode: o.deliveryAddress?.zip || ""
    },
    paymentDetails: o.paymentDetails || {
      razorpay_payment_id: o.paymentReference || "",
      method: o.paymentMethod || "Razorpay"
    },
    cart: (o.cart || []).map(item => ({
      ...item,
      title: item.name || item.title || "Product",
      id: item.productId || item._id || item.id
    }))
  };
};

// 4. Get All Orders (for Admin Panel)
const getAllOrders = async (req, res) => {
  try {
    const { search, status, paymentStatus, page = 1, limit = 10 } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const pages = parseInt(page);
    const limits = parseInt(limit);
    const skip = (pages - 1) * limits;

    const totalDoc = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limits);

    res.send({
      orders: orders.map(mapToAdminSchema),
      totalDoc,
      limits,
      pages: Math.ceil(totalDoc / limits)
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// 5. Get Order By ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send({ message: 'Order not found' });
    res.send(mapToAdminSchema(order));
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// 6. Update Order (status, payment, shipping)
const updateOrder = async (req, res) => {
  try {
    const { status, paymentStatus, shippingDetails } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).send({ message: 'Order not found' });

    if (status) {
      // If status is Cancelled or Returned, restore stock
      if ((status === 'Cancelled' || status === 'Returned') && order.status !== 'Cancelled' && order.status !== 'Returned') {
        await restoreStock(order.cart);
      }
      
      order.status = status;
      if (status === 'Shipped') order.shippingDate = new Date();
      if (status === 'Delivered') order.deliveryDate = new Date();
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
      if (paymentStatus === 'Paid') order.paymentDate = new Date();
    }

    if (shippingDetails) {
      const existingSd = order.shippingDetails?.toObject ? order.shippingDetails.toObject() : (order.shippingDetails || {});
      order.shippingDetails = Object.assign({}, existingSd, shippingDetails);
      order.markModified('shippingDetails');
    }

    await order.save();
    res.send({ message: 'Order updated successfully!', order });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// 7. Delete Order
const deleteOrder = async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.send({ message: 'Order deleted successfully!' });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// 8. Dashboard Metrics
// Real analytics computed with a single aggregation over Paid orders, bucketed
// by day/month boundaries so the admin sees live revenue instead of zeros.
const getDashboardAmount = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [row] = await Order.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      {
        $group: {
          _id: null,
          totalOrderAmount: { $sum: '$total' },
          todayOrderAmount: {
            $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, '$total', 0] }
          },
          yesterdayOrderAmount: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$createdAt', startOfYesterday] }, { $lt: ['$createdAt', startOfToday] }] },
                '$total',
                0
              ]
            }
          },
          thisMonthOrderAmount: {
            $sum: { $cond: [{ $gte: ['$createdAt', startOfThisMonth] }, '$total', 0] }
          },
          lastMonthOrderAmount: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$createdAt', startOfLastMonth] }, { $lt: ['$createdAt', startOfThisMonth] }] },
                '$total',
                0
              ]
            }
          }
        }
      }
    ]);

    res.send({
      todayOrderAmount: row?.todayOrderAmount || 0,
      yesterdayOrderAmount: row?.yesterdayOrderAmount || 0,
      thisMonthOrderAmount: row?.thisMonthOrderAmount || 0,
      lastMonthOrderAmount: row?.lastMonthOrderAmount || 0,
      totalOrderAmount: row?.totalOrderAmount || 0
    });
  } catch (err) {
    console.error('[orders] getDashboardAmount', err);
    res.status(500).send({ message: 'Failed to compute dashboard amounts.' });
  }
};

const getDashboardCount = async (req, res) => {
  try {
    const totalOrder = await Order.countDocuments();
    const totalPendingOrder = await Order.countDocuments({ status: 'Pending' });
    const totalProcessingOrder = await Order.countDocuments({ status: 'Processing' });
    const totalDeliveredOrder = await Order.countDocuments({ status: 'Delivered' });

    res.send({
      totalOrder,
      totalPendingOrder,
      totalProcessingOrder,
      totalDeliveredOrder
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const getDashboardRecentOrder = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const orders = await Order.find().sort({ createdAt: -1 }).limit(limit);
    res.send({ orders });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Best-selling products by total quantity sold across Paid orders.
// Aggregates order line items so the admin chart reflects real sales.
const getBestSellerChart = async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const rows = await Order.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $unwind: '$cart' },
      {
        $group: {
          _id: '$cart.name',
          total: { $sum: '$cart.quantity' }
        }
      },
      { $sort: { total: -1 } },
      { $limit: limit }
    ]);

    const bestSellingProduct = rows.map((r) => ({
      name: r._id || 'Product',
      total: r.total || 0
    }));

    res.send({ bestSellingProduct });
  } catch (err) {
    console.error('[orders] getBestSellerChart', err);
    res.status(500).send({ message: 'Failed to compute best sellers.' });
  }
};

// 9. Public Order Tracking
const trackOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { phone } = req.query;

    if (!orderId || !phone) {
      return res.status(400).send({ message: 'Order ID and Phone number are required for tracking.' });
    }

    const order = await Order.findOne({ 
      orderId: new RegExp(`^${orderId}$`, 'i'),
      phone: new RegExp(`${phone}$`) // Match end of phone number
    });

    if (!order) {
      return res.status(404).send({ message: 'Order not found. Please check your Order ID and Phone number.' });
    }

    res.send({
      success: true,
      order: {
        orderId: order.orderId,
        status: order.status,
        date: order.createdAt,
        total: order.total,
        paymentStatus: order.paymentStatus,
        shippingDetails: order.shippingDetails || {},
        items: (order.cart || []).map(item => ({
          name: item.name || item.title || 'Product',
          quantity: item.quantity,
          image: item.image || ''
        }))
      }
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

module.exports = {
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
};
