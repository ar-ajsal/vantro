const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Product = require('../models/Product');

/**
 * Lightweight "is this request from an admin?" check.
 * Reads the Bearer token if present and verifies it against the Admin collection.
 * Returns true only when a valid, live admin token is supplied.
 * Never throws — failures are treated as "not admin".
 */
async function isAdminRequest(req) {
  try {
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (!header.startsWith('Bearer ')) return false;
    const token = header.split(' ')[1];
    if (!token || !process.env.JWT_SECRET) return false;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id || (decoded.type && decoded.type !== 'admin')) return false;
    const admin = await Admin.findById(decoded.id).select('_id').lean();
    return Boolean(admin);
  } catch (_) {
    return false;
  }
}

// Distinguish Mongoose validation errors (client's fault → 400) from real
// server errors (→ 500). Keeps HTTP semantics correct for callers.
function sendError(res, err, fallback = 'Something went wrong.') {
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).send({ message: err.message });
  }
  if (err && err.code === 11000) {
    return res.status(409).send({ message: 'A product with that unique field already exists.' });
  }
  console.error('[products]', err);
  return res.status(500).send({ message: fallback });
}

const addProduct = async (req, res) => {
  try {
    const categoryId = req.body.category || (Array.isArray(req.body.categories) && req.body.categories[0]);
    if (!categoryId) {
      return res.status(400).send({ message: 'Category is required for all products. Please select a category.' });
    }
    const payload = Object.assign({}, req.body);
    payload.category = categoryId;
    if (!payload.categories || !payload.categories.length) {
      payload.categories = [categoryId];
    }
    const newProduct = new Product(payload);
    await newProduct.save();
    res.status(201).send({ message: 'Product Added Successfully!', product: newProduct });
  } catch (err) {
    sendError(res, err, 'Failed to add product.');
  }
};

const addAllProducts = async (req, res) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return res.status(400).send({ message: 'Expected a non-empty array of products.' });
    }
    const inserted = await Product.insertMany(req.body);
    res.status(201).send({ message: 'Products Added Successfully!', count: inserted.length });
  } catch (err) {
    sendError(res, err, 'Failed to bulk-add products.');
  }
};

const getAllProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { category, title, bestSeller } = req.query;

    // Unauthenticated storefront requests must only see published products.
    // Admin panel always sends a Bearer token, so hidden products remain
    // visible there.
    const adminReq = await isAdminRequest(req);

    const query = {};
    if (!adminReq) query.status = 'show'; // hide unpublished from storefront
    if (category) query.categories = category;
    if (bestSeller === 'true') query.isBestSeller = true;
    if (title) {
      query.$or = [
        { 'title.en': { $regex: title, $options: 'i' } },
        { 'title.bn': { $regex: title, $options: 'i' } },
        { title: { $regex: title, $options: 'i' } } // tolerate string-typed titles
      ];
    }

    const [products, totalDoc] = await Promise.all([
      Product.find(query)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('category'),
      Product.countDocuments(query)
    ]);

    res.status(200).send({
      products,
      totalDoc,
      page,
      limit,
      pages: Math.ceil(totalDoc / limit)
    });
  } catch (err) {
    sendError(res, err, 'Failed to fetch products.');
  }
};

const getProductById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid product id.' });
    }
    const product = await Product.findById(req.params.id).populate('category');
    if (!product) return res.status(404).send({ message: 'Product not found!' });
    res.status(200).send(product);
  } catch (err) {
    sendError(res, err, 'Failed to fetch product.');
  }
};

const updateProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid product id.' });
    }
    const payload = Object.assign({}, req.body);
    if (payload.category || payload.categories) {
      const categoryId = payload.category || (Array.isArray(payload.categories) && payload.categories[0]);
      if (!categoryId) {
        return res.status(400).send({ message: 'Category is required for all products. Please select a category.' });
      }
      payload.category = categoryId;
      if (!payload.categories || !payload.categories.length) {
        payload.categories = [categoryId];
      }
    }
    const product = await Product.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).send({ message: 'Product not found!' });
    res.status(200).send({ message: 'Product Updated Successfully!', product });
  } catch (err) {
    sendError(res, err, 'Failed to update product.');
  }
};

const updateStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid product id.' });
    }
    const newStatus = req.body.status;
    if (newStatus !== 'show' && newStatus !== 'hide') {
      return res.status(400).send({ message: "status must be 'show' or 'hide'." });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: newStatus },
      { new: true }
    );
    if (!product) return res.status(404).send({ message: 'Product not found!' });
    res.status(200).send({ message: `Product ${newStatus === 'show' ? 'Published' : 'Unpublished'} Successfully!` });
  } catch (err) {
    sendError(res, err, 'Failed to update product status.');
  }
};

const deleteProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid product id.' });
    }
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).send({ message: 'Product not found!' });
    res.status(200).send({ message: 'Product Deleted Successfully!' });
  } catch (err) {
    sendError(res, err, 'Failed to delete product.');
  }
};

const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).populate('category');
    // Root-cause fix: previously returned 200 with a null body, so the
    // storefront couldn't tell "not found" from a real product.
    if (!product) return res.status(404).send({ message: 'Product not found!' });

    // Do not expose hidden products to unauthenticated (storefront) requests.
    if (product.status === 'hide') {
      const adminReq = await isAdminRequest(req);
      if (!adminReq) return res.status(404).send({ message: 'Product not found!' });
    }

    res.status(200).send(product);
  } catch (err) {
    sendError(res, err, 'Failed to fetch product.');
  }
};

const reorderProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).send({ message: 'productIds array is required.' });
    }
    
    // Bulk update to set the new order for these specific items on this page
    const ops = productIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } }
      }
    }));

    if (ops.length > 0) {
      await Product.bulkWrite(ops);
    }
    
    res.status(200).send({ message: 'Products reordered successfully!' });
  } catch (err) {
    sendError(res, err, 'Failed to reorder products.');
  }
};

module.exports = {
  getProductBySlug,
  addProduct,
  addAllProducts,
  getAllProducts,
  getProductById,
  updateProduct,
  updateStatus,
  deleteProduct,
  reorderProducts
};
