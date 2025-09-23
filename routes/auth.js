const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  changeRole,
  getPublicProfile
} = require('../controllers/authController');

const router = express.Router();

// Üye ol
router.post('/register', register);

// Giriş yap
router.post('/login', login);

// Public kullanıcı profili
router.get('/user/:userId', getPublicProfile);

// Profil bilgileri (korumalı)
router.get('/profile', authenticateToken, getProfile);

// Profil bilgilerini güncelle
router.put('/profile', authenticateToken, updateProfile);

// Rol değiştir (customer <-> provider)
router.patch('/profile/role', authenticateToken, changeRole);

module.exports = router; 