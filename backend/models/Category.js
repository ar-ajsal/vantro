const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: Object, required: true }, // e.g. { en: "Category Name" }
  description: { type: Object },
  parentId: { type: String },
  parentName: { type: String },
  id: { type: String },
  icon: { type: String },
  image: { type: String },
  status: { type: String, default: 'show' },
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
