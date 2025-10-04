const Proposal = require('../models/Proposal');
const Job = require('../models/Job');
const User = require('../models/User');

// Teklif oluşturma
const createProposal = async (req, res) => {
  try {
    
    const { jobId, description, price, duration } = req.body;
    const providerId = req.userId;

    // Validasyon
    if (!jobId || !description || !price || !duration || !duration.value || !duration.unit) {
      return res.status(400).json({
        success: false,
        message: 'Tüm alanlar gerekli'
      });
    }

    // Job'ın varlığını ve aktif olduğunu kontrol et - müşteri bilgileriyle birlikte
    const job = await Job.findById(jobId)
      .populate('customerId', 'name email');
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    if (job.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Bu ilana teklif veremezsiniz'
      });
    }

    // Kullanıcının provider olduğunu kontrol et
    const user = await User.findById(providerId);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({
        success: false,
        message: 'Sadece hizmet verenler teklif verebilir'
      });
    }

    // Kendi ilanına teklif vermeye çalışıyor mu kontrol et
    if (job.customerId && job.customerId.toString() === providerId) {
      return res.status(400).json({
        success: false,
        message: 'Kendi ilanınıza teklif veremezsiniz'
      });
    }

    // Daha önce teklif vermiş mi kontrol et
    const existingProposal = await Proposal.findOne({ jobId, providerId });
    if (existingProposal) {
      return res.status(400).json({
        success: false,
        message: 'Bu ilana zaten teklif vermişsiniz'
      });
    }

    // Teklif oluştur
    const proposal = new Proposal({
      jobId,
      providerId,
      description: description.trim(),
      price: parseFloat(price),
      duration: {
        value: parseInt(duration.value),
        unit: duration.unit
      }
    });

    const savedProposal = await proposal.save();

    // Job'ın proposal count'unu güncelle
    const proposalCount = await Proposal.countDocuments({ jobId });
    await Job.findByIdAndUpdate(jobId, { 'stats.proposalCount': proposalCount });

    // Populate ederek döndür
    const populatedProposal = await Proposal.findById(savedProposal._id)
      .populate('providerId', 'name profileImage location phone email')
      .populate('jobId', 'title');

    // Email bildirimi gönder
    try {
      const { sendProposalNotification } = require('../utils/emailService');
      
      // Müşteriye email gönder (hem üye hem misafir müşteriler için)
      const customerEmail = job.customerId ? job.customerId.email : job.guestCustomer?.email;
      if (customerEmail) {
        console.log(`Sending proposal notification to ${customerEmail} for job "${job.title}"`);
        await sendProposalNotification(
          customerEmail,
          job.title,
          user.name,
          parseFloat(price)
        );
        console.log(`✅ Email sent successfully to ${customerEmail}`);
      } else {
        console.log('⚠️ No customer email found, skipping notification');
      }
    } catch (emailError) {
      console.error('❌ Email notification error:', emailError);
      // Email hatası işlemi durdurmaz
    }

    res.status(201).json({
      success: true,
      message: 'Teklif başarıyla gönderildi',
      proposal: populatedProposal
    });

  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Kullanıcının tekliflerini listeleme
const getUserProposals = async (req, res) => {
  try {
    const providerId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const proposals = await Proposal.find({ providerId })
      .populate('jobId', 'title status location budget duration')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Proposal.countDocuments({ providerId });

    res.json({
      success: true,
      proposals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get user proposals error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// İlan sahibinin tekliflerini listeleme
const getJobProposals = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.userId;

    // Job'ın varlığını ve sahipliğini kontrol et
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // İlan sahibi mi kontrol et
    if (job.customerId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const proposals = await Proposal.find({ jobId })
      .populate('providerId', 'name profileImage location phone email providerInfo')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      proposals
    });

  } catch (error) {
    console.error('Get job proposals error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Teklif durumunu güncelleme (kabul/red)
const updateProposalStatus = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { status, notes } = req.body;
    const userId = req.userId;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz durum'
      });
    }

    const proposal = await Proposal.findById(proposalId).populate('jobId');
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: 'Teklif bulunamadı'
      });
    }

    // İlan sahibi mi kontrol et
    if (proposal.jobId.customerId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    // Durum güncelle
    proposal.status = status;
    proposal.notes = notes || '';
    
    if (status === 'accepted') {
      proposal.acceptedAt = new Date();
    } else if (status === 'rejected') {
      proposal.rejectedAt = new Date();
    }

    await proposal.save();

    const populatedProposal = await Proposal.findById(proposal._id)
      .populate('providerId', 'name profileImage location phone email')
      .populate('jobId', 'title');

    res.json({
      success: true,
      message: `Teklif ${status === 'accepted' ? 'kabul edildi' : 'reddedildi'}`,
      proposal: populatedProposal
    });

  } catch (error) {
    console.error('Update proposal status error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

module.exports = {
  createProposal,
  getUserProposals,
  getJobProposals,
  updateProposalStatus
};
