const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    value: {
      type: Number,
      required: true,
      min: 1
    },
    unit: {
      type: String,
      required: true,
      enum: ['saat', 'gün', 'hafta', 'ay']
    }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true
  },
  acceptedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
proposalSchema.index({ jobId: 1 });
proposalSchema.index({ providerId: 1 });
proposalSchema.index({ jobId: 1, providerId: 1 }, { unique: true }); // Bir provider bir job'a sadece bir teklif verebilir

module.exports = mongoose.model('Proposal', proposalSchema);
