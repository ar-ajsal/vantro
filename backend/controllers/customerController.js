const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const jwt = require('jsonwebtoken');

function normalizePhone(p) {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits.replace(/^0+/, '');
}

// Map validation/cast errors to 400, duplicate email to 409, log real faults.
function sendError(res, err, fallback = 'Something went wrong.') {
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).send({ message: err.message });
  }
  if (err && err.code === 11000) {
    return res.status(409).send({ message: 'A customer with that email already exists.' });
  }
  console.error('[customer]', err);
  return res.status(500).send({ message: fallback });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createCustomer = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).send({ message: 'Name must be at least 2 characters.' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).send({ message: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).send({ message: 'Password must be at least 6 characters.' });
    }

    const customerExists = await Customer.findOne({ email });
    if (customerExists) return res.status(409).send({ message: 'Customer already exists!' });

    const customer = await Customer.create({ name, email, password });

    res.status(201).send({
      message: 'Customer Registered Successfully!',
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      token: jwt.sign({ id: customer._id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' })
    });
  } catch (err) {
    sendError(res, err, 'Failed to register customer.');
  }
};

const loginCustomer = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send({ message: 'Email and password are required.' });
    }

    const customer = await Customer.findOne({ email });

    if (customer && (await customer.matchPassword(password))) {
      res.status(200).send({
        token: jwt.sign({ id: customer._id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' }),
        _id: customer._id,
        name: customer.name,
        email: customer.email
      });
    } else {
      res.status(401).send({ message: 'Invalid Email or Password!' });
    }
  } catch (err) {
    sendError(res, err, 'Failed to log in.');
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const [registered, orders] = await Promise.all([
      Customer.find({}).select('-password').sort({ createdAt: -1 }).lean(),
      Order.find({}).sort({ createdAt: -1 }).lean()
    ]);

    const map = new Map();

    // 1. Process orders to group by phone number (user main)
    orders.forEach(o => {
      const u = o.userInfo || {};
      const phoneRaw = (u.contact || o.phone || '').trim();
      const phoneKey = normalizePhone(phoneRaw);
      if (!phoneKey) return;

      if (!map.has(phoneKey)) {
        map.set(phoneKey, {
          _id: 'cust_' + phoneKey,
          phone: phoneRaw,
          normalizedPhone: phoneKey,
          name: u.name || o.customerName || 'Valued Customer',
          email: u.email || o.email || '',
          city: u.city || (o.deliveryAddress && o.deliveryAddress.city) || '',
          state: (o.deliveryAddress && o.deliveryAddress.state) || '',
          country: (o.deliveryAddress && o.deliveryAddress.country) || 'India',
          addresses: [],
          primaryAddress: '',
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: null,
          orders: [],
          createdAt: o.createdAt,
          updatedAt: o.createdAt
        });
      }

      const c = map.get(phoneKey);
      c.totalOrders++;
      c.totalSpent += Number(o.total || 0);

      // Extract delivery address from order
      const street = u.address || (o.deliveryAddress && (o.deliveryAddress.street || o.deliveryAddress.address)) || '';
      const city = u.city || (o.deliveryAddress && o.deliveryAddress.city) || '';
      const state = (o.deliveryAddress && o.deliveryAddress.state) || '';
      const zip = u.zipCode || (o.deliveryAddress && (o.deliveryAddress.zipCode || o.deliveryAddress.zip)) || '';
      const country = (o.deliveryAddress && o.deliveryAddress.country) || 'India';

      const addrParts = [street, city, state, zip, country].filter(Boolean);
      const addrStr = addrParts.join(', ');
      if (addrStr && !c.addresses.includes(addrStr)) {
        c.addresses.push(addrStr);
      }
      if (!c.primaryAddress && addrStr) {
        c.primaryAddress = addrStr;
      }
      if (!c.city && city) c.city = city;
      if (!c.state && state) c.state = state;

      // Keep latest order info
      if (!c.lastOrder) {
        c.lastOrder = {
          id: o._id,
          orderId: o.orderId || (o.invoice ? '#' + o.invoice : 'ORD-' + String(o._id).slice(-6).toUpperCase()),
          total: Number(o.total || 0),
          status: o.status || 'Pending',
          date: o.createdAt,
          itemsCount: (o.cart || []).reduce((acc, item) => acc + (item.quantity || 1), 0),
          items: (o.cart || []).map(i => ({
            name: i.title || i.name || 'Jewelry Item',
            price: Number(i.price || 0),
            quantity: Number(i.quantity || 1),
            image: i.image || '',
            variant: i.variant || ''
          }))
        };
      }

      c.orders.push({
        id: o._id,
        orderId: o.orderId || (o.invoice ? '#' + o.invoice : 'ORD-' + String(o._id).slice(-6).toUpperCase()),
        total: Number(o.total || 0),
        status: o.status || 'Pending',
        date: o.createdAt,
        itemsCount: (o.cart || []).length
      });

      if (new Date(o.createdAt) < new Date(c.createdAt)) {
        c.createdAt = o.createdAt;
      }
      if (new Date(o.createdAt) > new Date(c.updatedAt)) {
        c.updatedAt = o.createdAt;
      }
    });

    // 2. Merge registered customers
    registered.forEach(r => {
      const phoneKey = normalizePhone(r.phone);
      if (phoneKey && map.has(phoneKey)) {
        const existing = map.get(phoneKey);
        existing.customerId = r._id;
        existing.isRegistered = true;
        if (!existing.email && r.email) existing.email = r.email;
        if (!existing.name && r.name) existing.name = r.name;
      } else {
        // Registered customer without orders yet
        const key = phoneKey || String(r._id);
        map.set(key, {
          _id: r._id,
          customerId: r._id,
          phone: r.phone || '',
          normalizedPhone: phoneKey,
          name: r.name || 'Customer',
          email: r.email || '',
          city: r.address || '',
          addresses: r.address ? [r.address] : [],
          primaryAddress: r.address || '',
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: null,
          orders: [],
          isRegistered: true,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt || r.createdAt
        });
      }
    });

    const customers = Array.from(map.values()).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.status(200).send({ customers, totalDoc: customers.length });
  } catch (err) {
    sendError(res, err, 'Failed to fetch customers.');
  }
};

const getCustomerById = async (req, res) => {
  try {
    const param = (req.params.id || '').trim();
    const phoneKey = normalizePhone(param.replace(/^cust_/, ''));

    // Check if valid ObjectId for Customer model
    let customerDoc = null;
    if (mongoose.Types.ObjectId.isValid(param)) {
      customerDoc = await Customer.findById(param).select('-password').lean();
    }

    // Find all matching orders by phone or customer id
    const orderQuery = [];
    if (phoneKey) {
      orderQuery.push({ 'userInfo.contact': new RegExp(phoneKey + '$', 'i') });
      orderQuery.push({ phone: new RegExp(phoneKey + '$', 'i') });
    }
    if (customerDoc && customerDoc.phone) {
      const cPhoneKey = normalizePhone(customerDoc.phone);
      if (cPhoneKey) {
        orderQuery.push({ 'userInfo.contact': new RegExp(cPhoneKey + '$', 'i') });
        orderQuery.push({ phone: new RegExp(cPhoneKey + '$', 'i') });
      }
    }
    if (customerDoc && customerDoc.email) {
      orderQuery.push({ 'userInfo.email': customerDoc.email.toLowerCase() });
      orderQuery.push({ email: customerDoc.email.toLowerCase() });
    }

    const orders = orderQuery.length
      ? await Order.find({ $or: orderQuery }).sort({ createdAt: -1 }).lean()
      : [];

    if (!customerDoc && !orders.length) {
      return res.status(404).send({ message: 'Customer not found!' });
    }

    // Build unified customer profile
    const latestOrder = orders[0] || {};
    const u = latestOrder.userInfo || {};
    const addresses = [];

    orders.forEach(o => {
      const ou = o.userInfo || {};
      const street = ou.address || (o.deliveryAddress && (o.deliveryAddress.street || o.deliveryAddress.address)) || '';
      const city = ou.city || (o.deliveryAddress && o.deliveryAddress.city) || '';
      const state = (o.deliveryAddress && o.deliveryAddress.state) || '';
      const zip = ou.zipCode || (o.deliveryAddress && (o.deliveryAddress.zipCode || o.deliveryAddress.zip)) || '';
      const country = (o.deliveryAddress && o.deliveryAddress.country) || 'India';
      const addrStr = [street, city, state, zip, country].filter(Boolean).join(', ');
      if (addrStr && !addresses.includes(addrStr)) addresses.push(addrStr);
    });

    const totalSpent = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const profile = {
      _id: customerDoc ? customerDoc._id : ('cust_' + (phoneKey || param)),
      name: (customerDoc && customerDoc.name) || u.name || latestOrder.customerName || 'Valued Customer',
      phone: (customerDoc && customerDoc.phone) || u.contact || latestOrder.phone || phoneKey || '',
      email: (customerDoc && customerDoc.email) || u.email || latestOrder.email || '',
      addresses: addresses.length ? addresses : (customerDoc && customerDoc.address ? [customerDoc.address] : []),
      primaryAddress: addresses[0] || (customerDoc && customerDoc.address) || '',
      city: u.city || (latestOrder.deliveryAddress && latestOrder.deliveryAddress.city) || '',
      state: (latestOrder.deliveryAddress && latestOrder.deliveryAddress.state) || '',
      totalOrders: orders.length,
      totalSpent,
      orders: orders.map(o => ({
        id: o._id,
        orderId: o.orderId || (o.invoice ? '#' + o.invoice : 'ORD-' + String(o._id).slice(-6).toUpperCase()),
        total: Number(o.total || 0),
        status: o.status || 'Pending',
        paymentStatus: o.paymentStatus || 'Pending',
        date: o.createdAt,
        itemsCount: (o.cart || []).length,
        items: (o.cart || []).map(i => ({
          name: i.title || i.name || 'Jewelry Item',
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          image: i.image || '',
          variant: i.variant || ''
        }))
      })),
      lastOrder: latestOrder._id ? {
        id: latestOrder._id,
        orderId: latestOrder.orderId || (latestOrder.invoice ? '#' + latestOrder.invoice : 'ORD-' + String(latestOrder._id).slice(-6).toUpperCase()),
        total: Number(latestOrder.total || 0),
        status: latestOrder.status || 'Pending',
        date: latestOrder.createdAt,
        items: (latestOrder.cart || []).map(i => ({
          name: i.title || i.name || 'Jewelry Item',
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          image: i.image || '',
          variant: i.variant || ''
        }))
      } : null,
      isRegistered: Boolean(customerDoc),
      createdAt: customerDoc ? customerDoc.createdAt : (orders[orders.length - 1] ? orders[orders.length - 1].createdAt : new Date())
    };

    res.status(200).send(profile);
  } catch (err) {
    sendError(res, err, 'Failed to fetch customer.');
  }
};

module.exports = {
  createCustomer,
  loginCustomer,
  getAllCustomers,
  getCustomerById
};
