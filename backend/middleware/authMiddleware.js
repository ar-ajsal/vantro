const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Customer = require('../models/Customer');

/**
 * Extract a Bearer token from the Authorization header.
 */
const getToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.split(' ')[1];
  }
  return null;
};

const verify = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured on the server.');
  }
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * protectAdmin — requires a valid token that belongs to an Admin document.
 * A customer token will fail here because its id does not exist in the Admin collection.
 * Attaches req.admin.
 */
const protectAdmin = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).send({ message: 'Not authorized. No token provided.' });
    }

    const decoded = verify(token);

    // If the token declares a non-admin type, reject early.
    if (decoded.type && decoded.type !== 'admin') {
      return res.status(403).send({ message: 'Admin access required.' });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(403).send({ message: 'Admin access required.' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'Not authorized. Invalid or expired token.' });
  }
};

/**
 * requireRole — restrict to specific admin roles (e.g. 'super admin').
 * Must be used after protectAdmin.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) {
    return res.status(401).send({ message: 'Not authorized.' });
  }
  if (roles.length && !roles.includes(req.admin.role)) {
    return res.status(403).send({ message: 'Insufficient permissions for this action.' });
  }
  next();
};

/**
 * protectCustomer — requires a valid token that belongs to a Customer document.
 * Attaches req.customer.
 */
const protectCustomer = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).send({ message: 'Not authorized. No token provided.' });
    }

    const decoded = verify(token);

    if (decoded.type && decoded.type !== 'customer') {
      return res.status(403).send({ message: 'Customer access required.' });
    }

    const customer = await Customer.findById(decoded.id).select('-password');
    if (!customer) {
      return res.status(403).send({ message: 'Customer access required.' });
    }

    req.customer = customer;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'Not authorized. Invalid or expired token.' });
  }
};

module.exports = { protectAdmin, requireRole, protectCustomer };
