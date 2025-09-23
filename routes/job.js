const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  createJob,
  getJobs,
  getJobById,
  getMyJobs,
  getOpportunities,
  submitProposal,
  acceptProposal,
  updateJobStatus,
  getAllJobsForAdmin,
  deleteJob,
  getMyProposals,
  approveJob,
  deliverJob,
  createTestJobs
} = require('../controllers/jobController');

const router = express.Router();

// Public routes (üye olmadan erişilebilir)
// İlanları listeleme (genel)
router.get('/', getJobs);

// İlan detayı
router.get('/:id', getJobById);

// Protected routes (üye girişi gerekli)
// İlan oluşturma (optional auth - üye olmadan da ilan verilebilir)
router.post('/', optionalAuth, createJob);

// Kullanıcının kendi ilanları
router.get('/my/jobs', authenticateToken, getMyJobs);

// Hizmet veren için fırsatlar
router.get('/my/opportunities', authenticateToken, getOpportunities);

// Hizmet veren teklifleri
router.get('/my/proposals', authenticateToken, getMyProposals);

// Teklif verme (sadece provider)
router.post('/:jobId/proposals', authenticateToken, submitProposal);

// Teklif kabul etme (sadece ilan sahibi)
router.put('/:jobId/proposals/:proposalId/accept', authenticateToken, acceptProposal);

// İşi teslim etme (hizmet veren)
router.post('/:jobId/deliver', authenticateToken, deliverJob);

// İlan durumu güncelleme (sadece ilan sahibi)
router.put('/:id/status', authenticateToken, updateJobStatus);

// Admin routes (admin girişi gerekli)
const adminAuth = async (req, res, next) => {
  authenticateToken(req, res, async () => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          message: 'Kimlik doğrulama gerekli'
        });
      }

      const User = require('../models/User');
      const user = await User.findById(req.userId);
      
      if (user && user.role === 'admin') {
        next();
      } else {
        res.status(403).json({
          success: false,
          message: 'Admin yetkisi gerekli'
        });
      }
    } catch (error) {
      console.error('Admin auth error:', error);
      res.status(500).json({
        success: false,
        message: 'Kimlik doğrulama hatası'
      });
    }
  });
};

// Admin için tüm ilanları getirme
router.get('/admin/all', adminAuth, getAllJobsForAdmin);

// İlan silme (ilan sahibi ve admin için)
router.delete('/:id', authenticateToken, deleteJob);

// Admin için ilan silme
router.delete('/admin/:id', adminAuth, deleteJob);
router.post('/admin/:id/approve', adminAuth, approveJob);

// Test verileri oluşturma (sadece admin için)
router.post('/admin/create-test-jobs', adminAuth, createTestJobs);

module.exports = router; 