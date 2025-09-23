const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  createProposal,
  getUserProposals,
  getJobProposals,
  updateProposalStatus
} = require('../controllers/proposalController');

// Teklif oluşturma (sadece provider'lar)
router.post('/', authenticateToken, createProposal);

// Kullanıcının tekliflerini listeleme (provider için)
router.get('/my-proposals', authenticateToken, getUserProposals);

// İlan tekliflerini listeleme (job owner için)
router.get('/job/:jobId', authenticateToken, getJobProposals);

// Teklif durumunu güncelleme (job owner için)
router.put('/:proposalId/status', authenticateToken, updateProposalStatus);

module.exports = router;
