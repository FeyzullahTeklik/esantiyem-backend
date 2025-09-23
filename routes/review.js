const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  createReview,
  getJobReviews,
  getUserReviews,
  getCompletedJobs
} = require('../controllers/reviewController');

// Değerlendirme oluşturma
router.post('/', authenticateToken, createReview);

// Bir iş için değerlendirmeleri getirme
router.get('/job/:jobId', getJobReviews);

// Kullanıcı için değerlendirmeleri getirme
router.get('/user/:userId', getUserReviews);

// Tamamlanan işleri getirme
router.get('/completed/:userId', getCompletedJobs);

module.exports = router; 