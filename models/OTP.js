const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['password_reset', 'email_verification'],
    default: 'password_reset'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // 5 dakika sonra otomatik silinir
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  }
});

// Email ve type kombinasyonu için index
otpSchema.index({ email: 1, type: 1 });

module.exports = mongoose.model('OTP', otpSchema); 