const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Müşteri için: Ad Soyad, Hizmet veren için: Ünvan/Şirket adı
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['customer', 'provider', 'admin'],
    default: 'customer'
  },
  isEmailVerified: {
    type: Boolean,
    default: true
  },
  // Profil bilgileri
  profileImage: {
    type: String, // Cloudinary URL
  },
  about: {
    type: String,
    maxlength: 500
  },
  location: {
    city: {
      type: String,
      trim: true
    },
    district: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  // Hizmet veren için özel alanlar
  providerInfo: {
    experience: {
      type: Number, // Yıl
      min: 0
    },
    bio: {
      type: String,
      maxlength: 500
    },
    availableWorkDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    services: [{
      categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      },
      subcategoryId: String, // Subcategory ID within the category
      category: String, // Category name for display
      subcategory: String, // Subcategory name for display
      description: String,
      priceRange: {
        min: Number,
        max: Number
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    portfolio: [{
      title: String,
      description: String,
      images: [String], // Cloudinary URLs
      completedAt: Date
    }],
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },
  // İş istatistikleri
  stats: {
    completedJobs: {
      type: Number,
      default: 0
    },
    totalEarnings: {
      type: Number,
      default: 0
    },
    totalSpent: {
      type: Number,
      default: 0
    },
    reviewsGiven: {
      type: Number,
      default: 0
    },
    reviewsReceived: {
      type: Number,
      default: 0
    }
  },
  // KVKK onayı
  kvkkConsent: {
    accepted: {
      type: Boolean,
      required: true
    },
    acceptedAt: {
      type: Date,
      required: true
    },
    ip: {
      type: String,
      required: true
    }
  },
  // Hesap durumu
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Şifre hash'leme
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Şifre karşılaştırma
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Son giriş tarihini güncelle
userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema); 