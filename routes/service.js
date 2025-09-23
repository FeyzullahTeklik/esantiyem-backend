const express = require('express');
const router = express.Router();
const { authenticateToken, requireProvider, requireAdmin } = require('../middleware/auth');
const {
  createService,
  getServices,
  getServiceById,
  getMyServices,
  updateService,
  deleteService,
  updateCoverImage,
  incrementContactCount,
  getAllServicesForAdmin,
  updateServiceStatus
} = require('../controllers/serviceController');

// Public routes
router.get('/', getServices); // Tüm onaylanmış hizmetleri listele
router.get('/:id', getServiceById); // Tek hizmet detayı

// Provider routes (authentication required)
router.post('/', authenticateToken, requireProvider, createService); // Hizmet oluştur
router.get('/my/services', authenticateToken, requireProvider, getMyServices); // Kendi hizmetlerini listele
router.put('/:id', authenticateToken, requireProvider, updateService); // Hizmet güncelle
router.delete('/:id', authenticateToken, requireProvider, deleteService); // Hizmet sil
router.put('/:id/cover-image', authenticateToken, requireProvider, updateCoverImage); // Kapak görseli güncelle

// Contact tracking (authentication optional)
router.post('/:id/contact', incrementContactCount); // İletişim sayısını artır

// Admin routes
router.get('/admin/all', authenticateToken, requireAdmin, getAllServicesForAdmin); // Admin için tüm hizmetler
router.put('/admin/:id/status', authenticateToken, requireAdmin, updateServiceStatus); // Hizmet durumu güncelle

module.exports = router; 