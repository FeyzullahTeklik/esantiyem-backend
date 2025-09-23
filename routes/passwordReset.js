const express = require('express');
const router = express.Router();
const { sendResetCode, verifyResetCode, resetPassword } = require('../controllers/passwordResetController');

// Şifre sıfırlama kodu gönder
router.post('/send-code', sendResetCode);

// OTP doğrula
router.post('/verify-code', verifyResetCode);

// Yeni şifre belirle
router.post('/reset', resetPassword);

module.exports = router; 