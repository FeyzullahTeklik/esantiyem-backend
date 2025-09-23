const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  createSupportRequest,
  getUserSupportRequests,
  getUserApprovedJobs,
  getAllSupportRequests,
  respondToSupport,
  updateSupportStatus
} = require('../controllers/supportController');

// Kullanıcı route'ları
router.post('/', authenticateToken, createSupportRequest);
router.get('/my-requests', authenticateToken, getUserSupportRequests);
router.get('/my-jobs', authenticateToken, getUserApprovedJobs);

// Admin route'ları
router.get('/admin/all', authenticateToken, requireAdmin, getAllSupportRequests);
router.post('/admin/:id/respond', authenticateToken, requireAdmin, respondToSupport);
router.patch('/admin/:id/status', authenticateToken, requireAdmin, updateSupportStatus);

module.exports = router; 