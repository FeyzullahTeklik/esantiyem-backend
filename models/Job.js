const mongoose = require('mongoose');

// Teklif şeması
const proposalSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: String, // "1 gün", "2 hafta", "1 ay" gibi
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// İlan şeması
const jobSchema = new mongoose.Schema({
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
    maxlength: 5000
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
  // Müşteri bilgileri
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Üye olmayan müşteri için
  guestCustomer: {
    name: String,
    email: String,
    phone: String,
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  // Konum bilgileri
  location: {
    city: {
      type: String,
      required: true,
      trim: true
    },
    district: {
      type: String,
      required: true,
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
  // Dosya ve görsel yüklemeleri
  attachments: {
    images: [String], // Cloudinary URLs
    documents: [{
      name: String,
      url: String, // Cloudinary URL
      type: String // pdf, doc, etc.
    }]
  },
  // Bütçe bilgisi (opsiyonel)
  budget: {
    min: {
      type: Number,
      min: 0
    },
    max: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'TL'
    }
  },
  // İlan durumu
  status: {
    type: String,
    enum: ['pending', 'approved', 'accepted', 'completed', 'rejected'],
    default: 'pending'
  },
  // Teklifler
  proposals: [proposalSchema],
  // Kabul edilen teklif
  acceptedProposal: {
    type: mongoose.Schema.Types.ObjectId
  },
  // Kabul edilen teklif detayları
  acceptedAt: {
    type: Date
  },
  acceptedPrice: {
    type: Number
  },
  acceptedDuration: {
    type: String
  },
  // İş süresi
  duration: {
    value: {
      type: Number
    },
    unit: {
      type: String,
      enum: ['birkaç gün', 'birkaç hafta', 'birkaç ay']
    }
  },
  // İş teslim edilme bilgileri
  deliveredAt: {
    type: Date
  },
  deliveredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Maksimum teklif sayısı (admin ayarı)
  maxProposals: {
    type: Number,
    default: 10 // Admin panelinden değiştirilebilir
  },

  // İlan süresi
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 gün
    }
  },
  // İstatistikler
  stats: {
    views: {
      type: Number,
      default: 0
    },
    proposalCount: {
      type: Number,
      default: 0
    }
  },
  // Yönetici notları
  adminNotes: {
    type: String,
    trim: true
  },
  // KVKK onayı (üye olmayan müşteriler için)
  kvkkConsent: {
    accepted: {
      type: Boolean,
      required: function() {
        return !this.customerId; // Sadece guest müşteriler için gerekli
      }
    },
    acceptedAt: Date,
    ip: String
  }
}, {
  timestamps: true
});

// İndeksler
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ categoryId: 1, subcategoryId: 1 });
jobSchema.index({ 'location.city': 1, 'location.district': 1 });
jobSchema.index({ customerId: 1, status: 1 });
jobSchema.index({ expiresAt: 1 });

// Sanal alanlar
jobSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

jobSchema.virtual('proposalCount').get(function() {
  return this.proposals.length;
});

jobSchema.virtual('hasAcceptedProposal').get(function() {
  return !!this.acceptedProposal;
});

// Metodlar
jobSchema.methods.addProposal = function(proposalData) {
  if (this.proposals.length >= this.maxProposals) {
    throw new Error('Maksimum teklif sayısına ulaşıldı');
  }
  
  if (this.status !== 'approved') {
    throw new Error('Bu ilan artık aktif değil');
  }
  
  if (this.isExpired) {
    throw new Error('Bu ilanın süresi dolmuş');
  }
  
  this.proposals.push(proposalData);
  this.stats.proposalCount = this.proposals.length;
  return this.save();
};

jobSchema.methods.acceptProposal = function(proposalId) {
  const proposal = this.proposals.id(proposalId);
  if (!proposal) {
    throw new Error('Teklif bulunamadı');
  }
  
  // Diğer teklifleri reddet
  this.proposals.forEach(p => {
    if (p._id.toString() === proposalId.toString()) {
      p.status = 'accepted';
      p.respondedAt = new Date();
    } else {
      p.status = 'rejected';
      p.respondedAt = new Date();
    }
  });
  
  this.acceptedProposal = proposalId;
  this.status = 'accepted';
  
  return this.save();
};

jobSchema.methods.incrementViews = function() {
  this.stats.views += 1;
  return this.save();
};

// Pre-save middleware
jobSchema.pre('save', function(next) {
  // Süre kontrolü
  if (this.isExpired && this.status === 'approved') {
    this.status = 'rejected';
  }
  next();
});

module.exports = mongoose.model('Job', jobSchema); 