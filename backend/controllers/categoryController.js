const mongoose = require('mongoose');
const Category = require('../models/Category');

// Map Mongoose validation/cast errors to 400, duplicate keys to 409, and log
// genuine server faults before returning a 500. Keeps HTTP semantics correct.
function sendError(res, err, fallback = 'Something went wrong.') {
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).send({ message: err.message });
  }
  if (err && err.code === 11000) {
    return res.status(409).send({ message: 'A category with that unique field already exists.' });
  }
  console.error('[category]', err);
  return res.status(500).send({ message: fallback });
}

const addCategory = async (req, res) => {
  try {
    const payload = Object.assign({}, req.body);
    if (payload.image && !payload.icon) payload.icon = payload.image;
    if (payload.icon && !payload.image) payload.image = payload.icon;

    const newCategory = new Category(payload);
    await newCategory.save();
    res.status(201).send({ message: 'Category Added Successfully!', category: newCategory });
  } catch (err) {
    sendError(res, err, 'Failed to add category.');
  }
};

const getAllCategories = async (req, res) => {
  try {
    // Include a ?all=1 escape hatch used by the admin panel (which also sends
    // a Bearer token) so it can still display hidden categories.
    const showAll = req.query.all === '1';
    const filter = showAll ? {} : { status: 'show' };
    const categories = await Category.find(filter).sort({ createdAt: -1 });
    res.status(200).send({ categories });
  } catch (err) {
    sendError(res, err, 'Failed to fetch categories.');
  }
};

const getCategoryById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid category id.' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).send({ message: 'Category not found!' });
    res.status(200).send(category);
  } catch (err) {
    sendError(res, err, 'Failed to fetch category.');
  }
};

const updateCategory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid category id.' });
    }
    const payload = Object.assign({}, req.body);
    if (payload.image !== undefined && !payload.icon) payload.icon = payload.image;
    if (payload.icon !== undefined && !payload.image) payload.image = payload.icon;

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });
    if (!category) return res.status(404).send({ message: 'Category not found!' });
    res.status(200).send({ message: 'Category Updated Successfully!', category });
  } catch (err) {
    sendError(res, err, 'Failed to update category.');
  }
};

const updateStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid category id.' });
    }
    const newStatus = req.body.status;
    if (newStatus !== 'show' && newStatus !== 'hide') {
      return res.status(400).send({ message: "status must be 'show' or 'hide'." });
    }
    const category = await Category.findByIdAndUpdate(req.params.id, { status: newStatus }, { new: true });
    if (!category) return res.status(404).send({ message: 'Category not found!' });
    res.status(200).send({ message: `Category ${newStatus === 'show' ? 'Published' : 'Unpublished'} Successfully!` });
  } catch (err) {
    sendError(res, err, 'Failed to update category status.');
  }
};

const deleteCategory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: 'Invalid category id.' });
    }
    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).send({ message: 'Category not found!' });
    res.status(200).send({ message: 'Category Deleted Successfully!' });
  } catch (err) {
    sendError(res, err, 'Failed to delete category.');
  }
};

module.exports = {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  updateStatus,
  deleteCategory
};
