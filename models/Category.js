const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  icon: {
    type: String, // Icon class name veya emoji
    trim: true
  },
  subcategories: [subcategorySchema],
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Kategori sıralama için index
categorySchema.index({ order: 1, name: 1 });

// Subcategory için metodlar
categorySchema.methods.addSubcategory = function(subcategoryData) {
  this.subcategories.push(subcategoryData);
  return this.save();
};

categorySchema.methods.removeSubcategory = function(subcategoryId) {
  this.subcategories.pull({ _id: subcategoryId });
  return this.save();
};

categorySchema.methods.updateSubcategory = function(subcategoryId, updateData) {
  const subcategory = this.subcategories.id(subcategoryId);
  if (subcategory) {
    Object.assign(subcategory, updateData);
    return this.save();
  }
  throw new Error('Subcategory not found');
};

module.exports = mongoose.model('Category', categorySchema); 