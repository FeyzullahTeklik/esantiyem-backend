const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllCategories,
  getActiveCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory
} = require('../controllers/categoryController');

const router = express.Router();

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin yetkisi gerekli' 
    });
  }
  next();
};

// Public routes
router.get('/active', getActiveCategories); // Frontend için aktif kategoriler

// Admin routes
router.get('/', authenticateToken, requireAdmin, getAllCategories); // Admin için tüm kategoriler
router.post('/', authenticateToken, requireAdmin, createCategory); // Kategori oluştur
router.put('/:categoryId', authenticateToken, requireAdmin, updateCategory); // Kategori güncelle
router.delete('/:categoryId', authenticateToken, requireAdmin, deleteCategory); // Kategori sil

// Subcategory routes
router.post('/:categoryId/subcategories', authenticateToken, requireAdmin, addSubcategory); // Alt kategori ekle
router.put('/:categoryId/subcategories/:subcategoryId', authenticateToken, requireAdmin, updateSubcategory); // Alt kategori güncelle
router.delete('/:categoryId/subcategories/:subcategoryId', authenticateToken, requireAdmin, deleteSubcategory); // Alt kategori sil

module.exports = router; 