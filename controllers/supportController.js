const Support = require('../models/Support');
const Job = require('../models/Job');
const User = require('../models/User');

// Kullanıcı destek talebi oluşturma
const createSupportRequest = async (req, res) => {
  try {
    const { subject, message, jobId, category } = req.body;
    const userId = req.user.id;

    // Eğer jobId verilmişse, job'ın kullanıcıya ait olduğunu doğrula
    if (jobId) {
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ success: false, message: 'İş ilanı bulunamadı' });
      }
      
      // Job sahibi kontrolü (hem üye hem de misafir müşteriler için)
      const isOwner = (job.customerId && job.customerId.toString() === userId) ||
                     (job.guestCustomer && job.guestCustomer.email === req.user.email);
      
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Bu iş ilanı için destek talebi oluşturamazsınız' });
      }
    }

    const supportRequest = new Support({
      userId,
      jobId: jobId || null,
      subject,
      message,
      category: category || 'general'
    });

    await supportRequest.save();
    
    // Populate user bilgilerini getir
    await supportRequest.populate('userId', 'name email role');
    if (jobId) {
      await supportRequest.populate('jobId', 'title status');
    }

    res.status(201).json({
      success: true,
      message: 'Destek talebiniz başarıyla oluşturuldu',
      support: supportRequest
    });
  } catch (error) {
    console.error('Support request creation error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// Kullanıcının destek taleplerini listeleme
const getUserSupportRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const filter = { userId };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const supportRequests = await Support.find(filter)
      .populate('jobId', 'title status')
      .populate('responses.createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Support.countDocuments(filter);

    res.json({
      success: true,
      supports: supportRequests,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get user support requests error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// Kullanıcının onaylı iş ilanlarını getirme (destek formu için)
const getUserApprovedJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const jobs = await Job.find({
      $or: [
        { customerId: userId },
        { 'guestCustomer.email': req.user.email }
      ],
      status: { $in: ['approved', 'accepted', 'completed'] }
    })
    .select('title status createdAt')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    console.error('Get user approved jobs error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// Admin: Tüm destek taleplerini listeleme
const getAllSupportRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, priority, category, search } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (priority && priority !== 'all') filter.priority = priority;
    if (category && category !== 'all') filter.category = category;

    // Arama filtresi ekle
    if (search && search.trim()) {
      filter.$or = [
        { subject: { $regex: search.trim(), $options: 'i' } },
        { message: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const supportRequests = await Support.find(filter)
      .populate('userId', 'name email role profileImage')
      .populate('jobId', 'title status customerId guestCustomer')
      .populate('responses.createdBy', 'name role')
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Support.countDocuments(filter);

    // İstatistikler
    const stats = {
      open: await Support.countDocuments({ status: 'open' }),
      inProgress: await Support.countDocuments({ status: 'in-progress' }),
      resolved: await Support.countDocuments({ status: 'resolved' }),
      closed: await Support.countDocuments({ status: 'closed' }),
      urgent: await Support.countDocuments({ priority: 'urgent' })
    };

    res.json({
      success: true,
      supports: supportRequests,
      stats,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get all support requests error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// Admin: Destek talebine yanıt verme
const respondToSupport = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, status } = req.body;
    const adminId = req.user.id;

    const support = await Support.findById(id);
    if (!support) {
      return res.status(404).json({ success: false, message: 'Destek talebi bulunamadı' });
    }

    // Yanıt ekle
    support.responses.push({
      message,
      createdBy: adminId,
      isAdmin: true
    });

    // Durum güncelle
    if (status) {
      support.status = status;
    }

    await support.save();
    
    // Populate ve güncel veriyi döndür
    await support.populate('userId', 'name email role');
    await support.populate('jobId', 'title status');
    await support.populate('responses.createdBy', 'name role');

    res.json({
      success: true,
      message: 'Yanıt başarıyla gönderildi',
      support
    });
  } catch (error) {
    console.error('Respond to support error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// Admin: Destek talebi durumu güncelleme
const updateSupportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;

    const support = await Support.findById(id);
    if (!support) {
      return res.status(404).json({ success: false, message: 'Destek talebi bulunamadı' });
    }

    if (status) support.status = status;
    if (priority) support.priority = priority;

    await support.save();

    res.json({
      success: true,
      message: 'Durum başarıyla güncellendi',
      support
    });
  } catch (error) {
    console.error('Update support status error:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

module.exports = {
  createSupportRequest,
  getUserSupportRequests,
  getUserApprovedJobs,
  getAllSupportRequests,
  respondToSupport,
  updateSupportStatus
}; 