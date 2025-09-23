const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // İlgili iş
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  // Değerlendiren kullanıcı (puanı veren)
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Değerlendirilen kullanıcı (puanı alan)
  reviewedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Puan (1-5)
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  // Yorum
  comment: {
    type: String,
    required: true,
    maxlength: 500
  },
  // Değerlendiren kişi müşteri mi hizmet veren mi
  reviewerType: {
    type: String,
    enum: ['customer', 'provider'],
    required: true
  }
}, {
  timestamps: true
});

// Bir iş için aynı kişi sadece bir kez değerlendirme yapabilir
reviewSchema.index({ jobId: 1, reviewerId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema); 