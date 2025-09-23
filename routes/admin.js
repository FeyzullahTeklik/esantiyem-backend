const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllUsers,
  toggleUserStatus,
  getUserDetails,
  changeUserRole,
  updateUser,
  createUser,
  deleteUser,
  getSystemStats
} = require('../controllers/adminController');
const { deleteReview: deleteReviewController } = require('../controllers/reviewController');

const router = express.Router();

// Admin middleware - tüm admin route'ları için
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin yetkisi gerekli' 
    });
  }
  next();
};

// Sistem istatistikleri
router.get('/stats', authenticateToken, requireAdmin, getSystemStats);

// Kullanıcı CRUD işlemleri
router.get('/users', authenticateToken, requireAdmin, getAllUsers); // Tüm kullanıcıları listele
router.post('/users', authenticateToken, requireAdmin, createUser); // Yeni kullanıcı oluştur
router.get('/users/:userId', authenticateToken, requireAdmin, getUserDetails); // Kullanıcı detaylarını getir
router.put('/users/:userId', authenticateToken, requireAdmin, updateUser); // Kullanıcı bilgilerini güncelle
router.patch('/users/:userId/status', authenticateToken, requireAdmin, toggleUserStatus); // Kullanıcı durumunu değiştir
router.patch('/users/:userId/role', authenticateToken, requireAdmin, changeUserRole); // Kullanıcı rolünü değiştir
router.delete('/users/:userId', authenticateToken, requireAdmin, deleteUser); // Kullanıcı silme

// Review işlemleri
router.delete('/reviews/:reviewId', authenticateToken, requireAdmin, deleteReviewController); // Değerlendirme silme

module.exports = router; 