const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllBlogs,
  getBlogBySlug,
  getAllBlogsForAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  getPopularBlogs,
  getAllTags,
  getRelatedBlogs
} = require('../controllers/blogController');

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
router.get('/', getAllBlogs); // Tüm published bloglar
router.get('/popular', getPopularBlogs); // Popüler bloglar
router.get('/tags', getAllTags); // Tüm etiketler
router.get('/:slug', getBlogBySlug); // Slug ile blog detay
router.get('/:slug/related', getRelatedBlogs); // İlgili bloglar

// Admin routes
router.get('/admin/all', authenticateToken, requireAdmin, getAllBlogsForAdmin); // Admin: Tüm bloglar
router.post('/admin', authenticateToken, requireAdmin, createBlog); // Admin: Blog oluştur
router.put('/admin/:id', authenticateToken, requireAdmin, updateBlog); // Admin: Blog güncelle
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteBlog); // Admin: Blog sil

module.exports = router;

