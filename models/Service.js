const mongoose = require('mongoose');

// Hizmet İlanı Şeması
const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: String,
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Fiyat bilgileri
  pricing: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'TL'
    },
    priceType: {
      type: String,
      enum: ['fixed', 'starting_from', 'hourly', 'daily'],
      default: 'starting_from'
    }
  },
  // Kapak görseli
  coverImage: {
    type: String, // Cloudinary URL
    required: false
  },
  // Hizmet alanları
  serviceAreas: [{
    city: String,
    districts: [String] // Boş array = tüm ilçeler
  }],
  // Durum
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inactive'],
    default: 'pending'
  },
  // İstatistikler (basit)
  stats: {
    views: {
      type: Number,
      default: 0
    },
    contactCount: {
      type: Number,
      default: 0
    }
  },
  // Admin notları
  adminNotes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexler
serviceSchema.index({ providerId: 1 });
serviceSchema.index({ categoryId: 1 });
serviceSchema.index({ status: 1 });
serviceSchema.index({ 'serviceAreas.city': 1 });
serviceSchema.index({ createdAt: -1 });

// Virtual for category and subcategory names
serviceSchema.virtual('categoryName', {
  ref: 'Category',
  localField: 'categoryId',
  foreignField: '_id',
  justOne: true
});

// Populate ayarları
serviceSchema.set('toJSON', { virtuals: true });
serviceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Service', serviceSchema); 