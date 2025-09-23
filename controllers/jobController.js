const Job = require('../models/Job');
const Category = require('../models/Category');
const User = require('../models/User');
const { deleteJobFiles } = require('./uploadController');

// İlan oluşturma
const createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      categoryId,
      subcategoryId,
      budget,
      location,
      attachments,
      duration,
      guestCustomer,
      kvkkConsent
    } = req.body;

    if (!title || !description || !categoryId || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Başlık, açıklama, kategori ve konum gerekli' 
      });
    }

    // KVKK onayı kontrolü
    if (!kvkkConsent || !kvkkConsent.accepted) {
      return res.status(400).json({ 
        success: false, 
        message: 'KVKK onayı gerekli' 
      });
    }

    // Duration kontrolü
    if (!duration || !duration.value || !duration.unit) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tahmini süre bilgisi gerekli' 
      });
    }

    const jobData = {
      title,
      description,
      categoryId,
      subcategoryId,
      budget,
      location,
      attachments: attachments || { images: [], documents: [] },
      duration,
      status: 'pending', // İlanlar onay için bekleyecek
      kvkkConsent
    };

    // Kullanıcı giriş yapmışsa customerId ekle, yoksa guestCustomer
    if (req.userId) {
      jobData.customerId = req.userId;
    } else {
      if (!guestCustomer || !guestCustomer.name || !guestCustomer.email || !guestCustomer.phone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Misafir kullanıcı için iletişim bilgileri gerekli' 
        });
      }
      jobData.guestCustomer = guestCustomer;
    }

    const job = new Job(jobData);
    await job.save();

    res.status(201).json({
      success: true,
      message: 'İş ilanı oluşturuldu ve onay için gönderildi',
      job
    });
  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'İş ilanı oluşturulurken hata oluştu' 
    });
  }
};

// İlanları listeleme (genel)
const getJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      categories, // Virgülle ayrılmış kategori ID'leri
      subcategory,
      city,
      district,
      status = 'approved',
      search,
      budgetMin,
      budgetMax,
      sortBy = 'newest'
    } = req.query;

    // Filtre oluştur - Public API'de sadece approved işler görünür
    const allowedStatuses = ['approved']; // Güvenlik: Sadece onaylanmış işler public
    const safeStatus = allowedStatuses.includes(status) ? status : 'approved';
    const filter = { status: safeStatus };

    if (category) {
      filter.categoryId = category;
    }

    // Çoklu kategori filtresi (provider'ın kendi kategorileri için)
    if (categories) {
      const categoryIds = categories.split(',').filter(Boolean);
      if (categoryIds.length > 0) {
        filter.categoryId = { $in: categoryIds };
      }
    }

    if (subcategory) {
      filter.subcategoryId = subcategory;
    }

    if (city) {
      filter['location.city'] = city;
    }

    if (district) {
      filter['location.district'] = district;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Bütçe filtreleri
    if (budgetMin || budgetMax) {
      if (budgetMin) {
        filter['budget.min'] = { $gte: parseInt(budgetMin) };
      }
      if (budgetMax) {
        filter['budget.max'] = { $lte: parseInt(budgetMax) };
      }
    }

    // Sayfalama
    const skip = (page - 1) * limit;

    // Sıralama
    let sortOptions = { createdAt: -1 }; // Default: newest
    switch (sortBy) {
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'budget_high':
        sortOptions = { 'budget.max': -1, 'budget.min': -1 };
        break;
      case 'budget_low':
        sortOptions = { 'budget.min': 1, 'budget.max': 1 };
        break;
      case 'most_proposals':
        sortOptions = { 'stats.proposalCount': -1 };
        break;
      case 'least_proposals':
        sortOptions = { 'stats.proposalCount': 1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // İlanları getir
    let jobs = await Job.find(filter)
      .populate('categoryId', 'name')
      .populate('customerId', 'name profileImage location.city location.district')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Eğer arama terimi varsa, kategori adına göre de filtrele
    if (search) {
      const allJobs = await Job.find()
        .populate('categoryId', 'name')
        .populate('customerId', 'name profileImage location.city location.district')
        .lean();
      
      const categoryFilteredJobs = allJobs.filter(job => {
        const categoryName = job.categoryId?.name || '';
        const customerName = job.customerId?.name || job.guestCustomer?.name || '';
        const searchLower = search.toLowerCase();
        
        return job.title.toLowerCase().includes(searchLower) ||
               job.description.toLowerCase().includes(searchLower) ||
               categoryName.toLowerCase().includes(searchLower) ||
               customerName.toLowerCase().includes(searchLower);
      });

      // Diğer filtreleri uygula
      let filteredJobs = categoryFilteredJobs;
      
      if (category) {
        filteredJobs = filteredJobs.filter(job => job.categoryId?._id.toString() === category);
      }
      
      if (subcategory) {
        filteredJobs = filteredJobs.filter(job => job.subcategoryId === subcategory);
      }
      
      if (city) {
        filteredJobs = filteredJobs.filter(job => job.location?.city === city);
      }
      
      if (district) {
        filteredJobs = filteredJobs.filter(job => job.location?.district === district);
      }
      
      // Sadece approved işleri göster
      const allowedStatuses = ['approved'];
      const safeStatus = allowedStatuses.includes(status) ? status : 'approved';
      filteredJobs = filteredJobs.filter(job => job.status === safeStatus);
      
      // Sıralama uygula
      filteredJobs.sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'budget_high':
            return (b.budget?.max || 0) - (a.budget?.max || 0);
          case 'budget_low':
            return (a.budget?.min || 0) - (b.budget?.min || 0);
          case 'most_proposals':
            return (b.stats?.proposalCount || 0) - (a.stats?.proposalCount || 0);
          case 'least_proposals':
            return (a.stats?.proposalCount || 0) - (b.stats?.proposalCount || 0);
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
      
      // Pagination uygula
      const total = filteredJobs.length;
      jobs = filteredJobs.slice(skip, skip + parseInt(limit));
      
      return res.json({
        success: true,
        jobs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      });
    }

    // Toplam sayı
    const total = await Job.countDocuments(filter);

    // Görüntüleme sayısını artır (sadece detay sayfası için değil)
    // jobs.forEach(job => job.incrementViews());

    res.json({
      success: true,
      jobs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('İlan listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İlanlar getirilirken hata oluştu'
    });
  }
};

// İlan detayı
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findById(id)
      .populate('categoryId', 'name icon subcategories')
      .populate('customerId', 'name profileImage location about')
      .populate('proposals.providerId', 'name profileImage providerInfo.rating location');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // Görüntüleme sayısını artır
    await job.incrementViews();

    res.json({
      success: true,
      job
    });

  } catch (error) {
    console.error('İlan detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İlan getirilirken hata oluştu'
    });
  }
};

// Kullanıcının ilanları
const getMyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ customerId: req.userId })
      .populate('categoryId', 'name')
      .populate('subcategoryId', 'name')
      .populate({
        path: 'proposals.providerId',
        select: 'name profileImage providerInfo.rating location email phone'
      })
      .sort({ createdAt: -1 });

    // Her job için review durumunu kontrol et
    const Review = require('../models/Review');
    const jobsWithReviewStatus = await Promise.all(
      jobs.map(async (job) => {
        const jobObj = job.toObject();
        
        if (jobObj.status === 'completed') {
          // Müşterinin bu iş için review yapıp yapmadığını kontrol et
          const existingReview = await Review.findOne({
            jobId: jobObj._id,
            reviewerId: req.userId
          });
          jobObj.hasReviewed = !!existingReview;
          
          // Review varsa bilgilerini de döndür
          if (existingReview) {
            jobObj.myReview = {
              rating: existingReview.rating,
              comment: existingReview.comment,
              createdAt: existingReview.createdAt
            };
          }
        }
        
        return jobObj;
      })
    );

    res.json({
      success: true,
      jobs: jobsWithReviewStatus
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({ success: false, message: 'İlanlar getirilemedi' });
  }
};

// Hizmet veren için fırsatlar
const getOpportunities = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, city, district } = req.query;
    
    // Sadece aktif ilanları göster
    const filter = { 
      status: 'active',
      expiresAt: { $gt: new Date() }
    };

    // Hizmet verenin kendi verdiği teklifleri hariç tut
    filter['proposals.providerId'] = { $ne: req.userId };

    if (category) {
      filter.categoryId = category;
    }

    if (city) {
      filter['location.city'] = city;
    }

    if (district) {
      filter['location.district'] = district;
    }

    const skip = (page - 1) * limit;

    const jobs = await Job.find(filter)
      .populate('categoryId', 'name icon')
      .populate('customerId', 'name location.city location.district')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Job.countDocuments(filter);

    res.json({
      success: true,
      opportunities: jobs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Fırsatlar listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Fırsatlar getirilirken hata oluştu'
    });
  }
};

// Teklif verme
const submitProposal = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { description, price, duration } = req.body;

    // Validasyon
    if (!description || !price || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Açıklama, fiyat ve süre bilgileri gerekli'
      });
    }

    // İlanı bul ve müşteri bilgilerini populate et
    const job = await Job.findById(jobId)
      .populate('customerId', 'name email');
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // Kullanıcının provider olduğunu kontrol et
    if (req.user.role !== 'provider') {
      return res.status(403).json({
        success: false,
        message: 'Sadece hizmet verenler teklif verebilir'
      });
    }

    // Kendi ilanına teklif veremez
    if (job.customerId && job.customerId._id.toString() === req.userId) {
      return res.status(400).json({
        success: false,
        message: 'Kendi ilanınıza teklif veremezsiniz'
      });
    }

    // Daha önce teklif vermiş mi kontrol et
    const existingProposal = job.proposals.find(
      p => p.providerId.toString() === req.userId
    );

    if (existingProposal) {
      return res.status(400).json({
        success: false,
        message: 'Bu ilana zaten teklif vermişsiniz'
      });
    }

    // Teklif ekle
    const proposalData = {
      providerId: req.userId,
      description,
      price: parseFloat(price),
      duration
    };

    await job.addProposal(proposalData);

    // Güncellenmiş ilanı döndür
    await job.populate('proposals.providerId', 'name profileImage providerInfo.rating');

    // Email bildirimi gönder
    try {
      const { sendProposalNotification } = require('../utils/emailService');
      
      // Müşteriye email gönder (hem üye hem misafir müşteriler için)
      const customerEmail = job.customerId ? job.customerId.email : job.guestCustomer?.email;
      if (customerEmail) {
        await sendProposalNotification(
          customerEmail,
          job.title,
          req.user.name,
          parseFloat(price)
        );
      }
    } catch (emailError) {
      console.error('Email bildirimi gönderilirken hata:', emailError);
      // Email hatası işi durdurmaz
    }

    res.json({
      success: true,
      message: 'Teklif başarıyla gönderildi',
      job
    });

  } catch (error) {
    console.error('Teklif verme hatası:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Teklif gönderilirken hata oluştu'
    });
  }
};

// Teklif kabul etme
const acceptProposal = async (req, res) => {
  try {
    const { jobId, proposalId } = req.params;

    // İlanı bul
    const job = await Job.findById(jobId)
      .populate('customerId', 'name profileImage email phone location')
      .populate('proposals.providerId', 'name profileImage email phone location providerInfo.rating');
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // İlan sahibi mi kontrol et
    if (!job.customerId || job.customerId._id.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Sadece ilan sahibi teklif kabul edebilir'
      });
    }

    // Kabul edilecek teklifi bul
    const proposalToAccept = job.proposals.find(p => p._id.toString() === proposalId);
    if (!proposalToAccept) {
      return res.status(404).json({
        success: false,
        message: 'Teklif bulunamadı'
      });
    }

    // Teklif zaten kabul edilmiş mi kontrol et
    if (proposalToAccept.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Bu teklif zaten kabul edilmiş'
      });
    }

    // Teklifi kabul et ve diğerlerini reddet
    job.proposals.forEach(proposal => {
      if (proposal._id.toString() === proposalId) {
        proposal.status = 'accepted';
        proposal.respondedAt = new Date();
      } else if (proposal.status === 'pending') {
        proposal.status = 'rejected';
        proposal.respondedAt = new Date();
      }
    });

    // İş ilanı durumunu "accepted" yap ve kabul edilen teklif bilgilerini kaydet
    job.status = 'accepted';
    job.acceptedProposal = proposalToAccept._id;
    job.acceptedAt = new Date();
    job.acceptedPrice = proposalToAccept.price;
    job.acceptedDuration = proposalToAccept.duration;

    await job.save();

    // Güncellenmiş ilanı tekrar populate et
    await job.populate('acceptedProposal');

    // Email bildirimi gönder (hizmet verene)
    try {
      const { sendProposalAcceptedNotification } = require('../utils/emailService');
      
      await sendProposalAcceptedNotification(
        proposalToAccept.providerId.email,
        job.title,
        job.customerId.name,
        proposalToAccept.price
      );
    } catch (emailError) {
      console.error('Email bildirimi gönderilirken hata:', emailError);
      // Email hatası işi durdurmaz
    }

    res.json({
      success: true,
      message: 'Teklif başarıyla kabul edildi. İş devam ediyor durumuna geçti.',
      job: {
        _id: job._id,
        title: job.title,
        status: job.status,
        acceptedAt: job.acceptedAt,
        acceptedPrice: job.acceptedPrice,
        acceptedDuration: job.acceptedDuration,
        customer: {
          _id: job.customerId._id,
          name: job.customerId.name,
          profileImage: job.customerId.profileImage,
          email: job.customerId.email,
          phone: job.customerId.phone,
          location: job.customerId.location
        },
        acceptedProvider: {
          _id: proposalToAccept.providerId._id,
          name: proposalToAccept.providerId.name,
          profileImage: proposalToAccept.providerId.profileImage,
          email: proposalToAccept.providerId.email,
          phone: proposalToAccept.providerId.phone,
          location: proposalToAccept.providerId.location,
          rating: proposalToAccept.providerId.providerInfo?.rating
        }
      }
    });

  } catch (error) {
    console.error('Teklif kabul etme hatası:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Teklif kabul edilirken hata oluştu'
    });
  }
};

// İşi teslim etme (hizmet veren tarafından)
const deliverJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    // İlanı bul
    const job = await Job.findById(jobId)
      .populate('customerId', 'name profileImage email phone location')
      .populate('proposals.providerId', 'name profileImage email phone location providerInfo.rating');
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // İş accepted durumunda mı kontrol et
    if (job.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Sadece kabul edilmiş işler teslim edilebilir'
      });
    }

    // Kabul edilen teklif var mı ve bu kullanıcı kabul edilen provider mı
    if (!job.acceptedProposal) {
      return res.status(400).json({
        success: false,
        message: 'Bu işte kabul edilen teklif bulunamadı'
      });
    }

    const acceptedProposal = job.proposals.find(p => p._id.toString() === job.acceptedProposal.toString());
    if (!acceptedProposal || acceptedProposal.providerId._id.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Sadece kabul edilen hizmet veren işi teslim edebilir'
      });
    }

    // İş durumunu completed yap ve teslim bilgilerini kaydet
    job.status = 'completed';
    job.deliveredAt = new Date();
    job.deliveredBy = req.userId;

    await job.save();

    // İstatistikleri güncelle
    const User = require('../models/User');
    
    // Provider stats güncelle (iş tamamladı, kazanç eklendi)
    await User.findByIdAndUpdate(req.userId, {
      $inc: { 
        'stats.completedJobs': 1,
        'stats.totalEarnings': job.acceptedPrice || 0
      }
    });

    // Customer stats güncelle (iş tamamlandı, harcama eklendi)
    await User.findByIdAndUpdate(job.customerId._id, {
      $inc: { 
        'stats.completedJobs': 1,
        'stats.totalSpent': job.acceptedPrice || 0
      }
    });

    res.json({
      success: true,
      message: 'İş başarıyla teslim edildi!',
      job: {
        _id: job._id,
        title: job.title,
        status: job.status,
        acceptedAt: job.acceptedAt,
        deliveredAt: job.deliveredAt,
        acceptedPrice: job.acceptedPrice,
        acceptedDuration: job.acceptedDuration,
        customer: {
          _id: job.customerId._id,
          name: job.customerId.name,
          profileImage: job.customerId.profileImage,
          email: job.customerId.email,
          phone: job.customerId.phone,
          location: job.customerId.location
        },
        provider: {
          _id: acceptedProposal.providerId._id,
          name: acceptedProposal.providerId.name,
          profileImage: acceptedProposal.providerId.profileImage,
          email: acceptedProposal.providerId.email,
          phone: acceptedProposal.providerId.phone,
          location: acceptedProposal.providerId.location,
          rating: acceptedProposal.providerId.providerInfo?.rating
        }
      }
    });

  } catch (error) {
    console.error('İş teslim etme hatası:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'İş teslim edilirken hata oluştu'
    });
  }
};

// İlan durumu güncelleme
const updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'accepted', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz durum'
      });
    }

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İlan bulunamadı'
      });
    }

    // İlan sahibi veya admin mi kontrol et
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin, ilan sahibi veya kabul edilen teklifin sahibi kontrol et
    const isAdmin = user.role === 'admin';
    const isJobOwner = job.customerId && job.customerId.toString() === req.userId;
    
    // Kabul edilen teklifin sahibi mi kontrol et
    let isAcceptedProvider = false;
    if (job.proposals && job.proposals.length > 0) {
      const acceptedProposal = job.proposals.find(p => p.status === 'accepted');
      if (acceptedProposal && acceptedProposal.providerId && acceptedProposal.providerId.toString() === req.userId) {
        isAcceptedProvider = true;
      }
    }
    
    if (!isAdmin && !isJobOwner && !isAcceptedProvider) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlemi yapmaya yetkiniz yok'
      });
    }

    job.status = status;
    await job.save();

    res.json({
      success: true,
      message: 'İlan durumu güncellendi',
      job
    });

  } catch (error) {
    console.error('İlan durumu güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İlan durumu güncellenirken hata oluştu'
    });
  }
};

// Admin için tüm ilanları listeleme
const getAllJobsForAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      search,
      city,
      fromDate
    } = req.query;

    // Filtre oluştur (admin için status filtresi opsiyonel)
    const filter = {};

    if (category) {
      filter.categoryId = category;
    }

    if (status) {
      filter.status = status;
    }

    if (city) {
      filter['location.city'] = city;
    }

    if (fromDate) {
      filter.createdAt = { $gte: new Date(fromDate) };
    }

    // Arama terimi varsa özel işlem
    let jobs;
    let total;

    if (search) {
      // Arama için tüm ilanları getir
      const allJobs = await Job.find()
        .populate('categoryId', 'name icon')
        .populate('subcategoryId', 'name')
        .populate('customerId', 'name email profileImage location phone')
        .populate({
          path: 'proposals.providerId',
          select: 'name email profileImage location providerInfo.rating'
        })
        .lean();

      // JavaScript ile filtreleme (kategori adı ve müşteri adı dahil)
      let filteredJobs = allJobs.filter(job => {
        const searchLower = search.toLowerCase();
        const categoryName = job.categoryId?.name || '';
        const customerName = job.customerId?.name || job.guestCustomer?.name || '';
        
        return job.title.toLowerCase().includes(searchLower) ||
               job.description.toLowerCase().includes(searchLower) ||
               categoryName.toLowerCase().includes(searchLower) ||
               customerName.toLowerCase().includes(searchLower);
      });

      // Diğer filtreleri uygula
      if (category) {
        filteredJobs = filteredJobs.filter(job => 
          job.categoryId?._id.toString() === category
        );
      }

      if (status) {
        filteredJobs = filteredJobs.filter(job => job.status === status);
      }

      // Sıralama
      filteredJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Pagination
      total = filteredJobs.length;
      const skip = (page - 1) * limit;
      jobs = filteredJobs.slice(skip, skip + parseInt(limit));
    } else {
      // Normal filtreleme (arama yok)
    // Sayfalama
    const skip = (page - 1) * limit;

      // İlanları getir
      jobs = await Job.find(filter)
      .populate('categoryId', 'name icon')
      .populate('subcategoryId', 'name')
      .populate('customerId', 'name email profileImage location phone')
      .populate({
        path: 'proposals.providerId',
        select: 'name email profileImage location providerInfo.rating'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

      // Toplam sayı
      total = await Job.countDocuments(filter);
    }

    // Kabul edilen teklif sahibi bilgilerini ekle
    const jobsWithAcceptedProviders = jobs.map(job => {
      if (job.status === 'closed' && job.acceptedProposal) {
        const acceptedProposal = job.proposals?.find(p => p._id.toString() === job.acceptedProposal.toString());
        if (acceptedProposal && acceptedProposal.providerId) {
          job.acceptedProvider = acceptedProposal.providerId;
        }
      }
      return job;
    });

    // İstatistikleri hesapla
    const stats = {
      pending: await Job.countDocuments({ status: 'pending' }),
      approved: await Job.countDocuments({ status: 'approved' }),
      accepted: await Job.countDocuments({ status: 'accepted' }),
      completed: await Job.countDocuments({ status: 'completed' }),
      rejected: await Job.countDocuments({ status: 'rejected' }),
      totalProposals: await Job.aggregate([
        { $unwind: '$proposals' },
        { $count: 'total' }
      ]).then(result => result[0]?.total || 0)
    };

    res.json({
      success: true,
      jobs: jobsWithAcceptedProviders,
      stats,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Admin ilan listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İlanlar getirilirken hata oluştu'
    });
  }
};

// İlan silme (admin ve ilan sahibi için)
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'İş ilanı bulunamadı' 
      });
    }

    // Kullanıcıyı kontrol et
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin değilse ve ilan sahibi değilse hata ver
    if (user.role !== 'admin' && (!job.customerId || job.customerId.toString() !== req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Sadece ilan sahibi veya admin ilanı silebilir'
      });
    }

    // Eğer iş devam ediyorsa veya tamamlanmışsa silinemez
    if (job.status === 'accepted' || job.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Devam eden veya tamamlanmış işler silinemez'
      });
    }

    // Cloudinary'den iş ilanına ait tüm dosyaları sil
    try {
      const deleteResult = await deleteJobFiles(id);
      console.log('Job files deletion result:', deleteResult);
    } catch (error) {
      console.error('Job files deletion error:', error);
      // Dosya silme hatası olsa bile ilanı silmeye devam et
    }

    // Veritabanından iş ilanını sil
    await Job.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'İş ilanı ve dosyaları başarıyla silindi'
    });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'İş ilanı silinirken hata oluştu' 
    });
  }
};

// Hizmet verenin teklifleri
const getMyProposals = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    // Total count için ayrı query
    const totalCount = await Job.countDocuments({
      'proposals.providerId': req.userId
    });
    
    const jobs = await Job.find({
      'proposals.providerId': req.userId
    })
      .populate('categoryId', 'name')
      .populate('customerId', 'name profileImage email phone location')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Sadece kullanıcının kendi tekliflerini döndür
    const userProposals = jobs.map(job => {
      const jobObj = job.toObject();
      const userProposal = jobObj.proposals?.find(p => 
        p.providerId?.toString() === req.userId
      );
      
      if (userProposal) {
        jobObj.proposals = [userProposal];
      }
      
      return jobObj;
    }).filter(job => job.proposals && job.proposals.length > 0);

    // Her job için review durumunu kontrol et  
    const Review = require('../models/Review');
    const proposalsWithReviewStatus = await Promise.all(
      userProposals.map(async (job) => {
        if (job.status === 'completed') {
          // Provider'ın bu iş için review yapıp yapmadığını kontrol et
          const existingReview = await Review.findOne({
            jobId: job._id,
            reviewerId: req.userId
          });
          job.hasReviewed = !!existingReview;
          
          // Review varsa bilgilerini de döndür
          if (existingReview) {
            job.myReview = {
              rating: existingReview.rating,
              comment: existingReview.comment,
              createdAt: existingReview.createdAt
            };
          }
        }
        
        return job;
      })
    );

    res.json({
      success: true,
      proposals: proposalsWithReviewStatus,
      pagination: {
        current: Number(page),
        pages: Math.ceil(totalCount / Number(limit)),
        total: totalCount,
        limit: Number(limit)
      }
    });
  } catch (error) {
    console.error('Get my proposals error:', error);
    res.status(500).json({ success: false, message: 'Teklifler getirilemedi' });
  }
};

const approveJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'İş ilanı bulunamadı' });
    }

    if (action === 'approve') {
      job.status = 'approved';
      console.log(`Job ${job._id} approved. Status changed to: ${job.status}`);
    } else if (action === 'reject') {
      job.status = 'rejected';
      console.log(`Job ${job._id} rejected. Status changed to: ${job.status}`);
    }

    await job.save();
    console.log(`Job ${job._id} saved with status: ${job.status}`);

    res.json({
      success: true,
      message: action === 'approve' ? 'İş ilanı onaylandı' : 'İş ilanı reddedildi',
      job
    });
  } catch (error) {
    console.error('Job approval error:', error);
    res.status(500).json({ success: false, message: 'İşlem sırasında hata oluştu' });
  }
};

// Test verileri oluşturma (sadece admin için)
const createTestJobs = async (req, res) => {
  try {
    const Category = require('../models/Category');
    
    // Test verilerini tanımla
    const testJobsData = [
      {
        title: "Banyo Tadilat İşi",
        description: "Apartman dairesinde banyo tamamen yenilenecek. Mevcut seramikler sökülerek yeni seramik döşenmesi, duş teknesi değiştirilmesi, lavabo ve klozet yenilenmesi gerekiyor. Sıhhi tesisat kontrolü ve gerekirse yenilenmesi dahil.",
        categoryName: "Tadilat",
        subcategoryId: "banyo-tadilat",
        location: {
          city: "İstanbul",
          district: "Kadıköy",
          address: "Moda Mahallesi"
        },
        budget: {
          min: 15000,
          max: 25000,
          currency: "TL"
        },
        duration: {
          value: 2,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Mehmet Yılmaz",
          email: "mehmet.yilmaz@email.com",
          phone: "0532 123 4567"
        }
      },
      {
        title: "Elektrik Tesisatı Yenileme",
        description: "Eski ev elektrik tesisatının tamamen yenilenmesi gerekiyor. Elektrik panosu değişimi, kablaj yenilenmesi, priz ve anahtar montajı dahil. Güç tesisatı ve aydınlatma sistemlerinin kurulması.",
        categoryName: "Elektrik Tesisatı",
        subcategoryId: "guc-tesisati",
        location: {
          city: "Ankara",
          district: "Çankaya",
          address: "Bahçelievler Mahallesi"
        },
        budget: {
          min: 8000,
          max: 15000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Ayşe Kaya",
          email: "ayse.kaya@email.com",
          phone: "0535 987 6543"
        }
      },
      {
        title: "Mutfak Dolap Yapımı",
        description: "L şeklinde mutfak dolabı yapılması isteniyor. Üst ve alt dolap, tezgah montajı dahil. Granit tezgah tercihi. Mevcut ölçülere göre özel tasarım.",
        categoryName: "Marangozluk",
        subcategoryId: "dolap",
        location: {
          city: "İzmir",
          district: "Bornova",
          address: "Kazımdirik Mahallesi"
        },
        budget: {
          min: 20000,
          max: 30000,
          currency: "TL"
        },
        duration: {
          value: 3,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Ali Demir",
          email: "ali.demir@email.com",
          phone: "0536 456 7890"
        }
      },
      {
        title: "Dış Cephe Boyası",
        description: "3 katlı binanın dış cephe boyası yapılacak. Mevcut boya kazınması, astar ve 2 kat boya uygulaması. Renk danışmanlığı dahil. İskele kurulumu gerekli.",
        categoryName: "Boya Badana",
        subcategoryId: "dis-boya",
        location: {
          city: "Bursa",
          district: "Osmangazi",
          address: "Panayır Mahallesi"
        },
        budget: {
          min: 12000,
          max: 18000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Fatma Şahin",
          email: "fatma.sahin@email.com",
          phone: "0537 789 0123"
        }
      },
      {
        title: "Salon Parke Döşeme",
        description: "35 m2 salon alanına laminat parke döşenmesi. Mevcut zemin hazırlığı, alt yapı ve parke montajı dahil. Su yalıtımı uygulaması gerekli.",
        categoryName: "Zemin Kaplama",
        subcategoryId: "parke",
        location: {
          city: "Antalya",
          district: "Muratpaşa",
          address: "Fener Mahallesi"
        },
        budget: {
          min: 6000,
          max: 10000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç gün"
        },
        guestCustomer: {
          name: "Hasan Çelik",
          email: "hasan.celik@email.com",
          phone: "0538 234 5678"
        }
      },
      {
        title: "Klima Montajı",
        description: "2 adet split klima montajı yapılacak. Salon ve yatak odası için. Boru çekimi, dış ünite montajı ve devreye alma dahil. Inverter teknoloji tercihi.",
        categoryName: "Mekanik Tesisat",
        subcategoryId: "sogutma-klima",
        location: {
          city: "Adana",
          district: "Seyhan",
          address: "Reşatbey Mahallesi"
        },
        budget: {
          min: 4000,
          max: 7000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç gün"
        },
        guestCustomer: {
          name: "Zeynep Arslan",
          email: "zeynep.arslan@email.com",
          phone: "0539 345 6789"
        }
      },
      {
        title: "Çatı İzolasyonu",
        description: "Villa çatısında su yalıtımı problemi var. Mevcut izolasyon sökülüp yeni bitümlü membran uygulanması gerekiyor. Çatı akıntılarının giderilmesi.",
        categoryName: "Dış Cephe",
        subcategoryId: "mantolama",
        location: {
          city: "Trabzon",
          district: "Ortahisar",
          address: "Gülbaharhatun Mahallesi"
        },
        budget: {
          min: 8000,
          max: 12000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Osman Öztürk",
          email: "osman.ozturk@email.com",
          phone: "0540 456 7890"
        }
      },
      {
        title: "Sıhhi Tesisat Tamir",
        description: "Mutfak ve banyo su tesisatında sızıntı problemi. Boru değişimi, armatür yenileme ve test işlemleri gerekli. Acil tamir olarak değerlendirilmeli.",
        categoryName: "Mekanik Tesisat",
        subcategoryId: "sihhi-tesisat",
        location: {
          city: "Eskişehir",
          district: "Odunpazarı",
          address: "Emek Mahallesi"
        },
        budget: {
          min: 2000,
          max: 5000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç gün"
        },
        guestCustomer: {
          name: "Elif Güney",
          email: "elif.guney@email.com",
          phone: "0541 567 8901"
        }
      },
      {
        title: "Alçı Tavan Yapımı",
        description: "Salon alanında asma tavan uygulaması. LED aydınlatma entegrasyonu ile modern tasarım. Spot ışık yerleşimi ve boyama dahil.",
        categoryName: "Duvar İşleri",
        subcategoryId: "alci-isleri",
        location: {
          city: "Konya",
          district: "Selçuklu",
          address: "Yazır Mahallesi"
        },
        budget: {
          min: 5000,
          max: 8000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Mustafa Aydın",
          email: "mustafa.aydin@email.com",
          phone: "0542 678 9012"
        }
      },
      {
        title: "Bahçe Peyzaj Düzenleme",
        description: "Villa bahçesinde peyzaj düzenlemesi. Çim ekimi, ağaç dikimi, çiçek tarhları oluşturma ve otomatik sulama sistemi kurulumu.",
        categoryName: "Mimari Danışmanlık",
        subcategoryId: "dis-mimari",
        location: {
          city: "Bodrum",
          district: "Merkez",
          address: "Konacık Mahallesi"
        },
        budget: {
          min: 15000,
          max: 25000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç ay"
        },
        guestCustomer: {
          name: "Gül Karaca",
          email: "gul.karaca@email.com",
          phone: "0543 789 0123"
        }
      },
      {
        title: "Kapı Pencere Değişimi",
        description: "Apartman dairesinde 2 adet balkon kapısı ve 3 adet pencere değişimi. PVC doğrama, çift cam, beyaz renk tercihi. Montaj ve eski kapı-pencere sökümü dahil.",
        categoryName: "Kapı ve Pencere",
        subcategoryId: "pencere",
        location: {
          city: "Gaziantep",
          district: "Şahinbey",
          address: "İbrahimli Mahallesi"
        },
        budget: {
          min: 12000,
          max: 18000,
          currency: "TL"
        },
        duration: {
          value: 1,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Ahmet Bulut",
          email: "ahmet.bulut@email.com",
          phone: "0544 890 1234"
        }
      },
      {
        title: "Isıtma Sistemi Kurulumu",
        description: "Müstakil evde kombi ve kalorifer sistemi kurulumu. Borulama, radyatör montajı ve sistem devreye alma. Kondenzli kombi tercihi var.",
        categoryName: "Mekanik Tesisat",
        subcategoryId: "isitma",
        location: {
          city: "Kayseri",
          district: "Melikgazi",
          address: "Sahabiye Mahallesi"
        },
        budget: {
          min: 18000,
          max: 25000,
          currency: "TL"
        },
        duration: {
          value: 2,
          unit: "birkaç hafta"
        },
        guestCustomer: {
          name: "Selin Yıldız",
          email: "selin.yildiz@email.com",
          phone: "0545 901 2345"
        }
      }
    ];

    const createdJobs = [];

    // Her test verisi için job oluştur
    for (const testJob of testJobsData) {
      try {
        // Kategori ID'sini bul
        const category = await Category.findOne({ name: testJob.categoryName });
        if (!category) {
          console.log(`Kategori bulunamadı: ${testJob.categoryName}`);
          continue;
        }

        const jobData = {
          title: testJob.title,
          description: testJob.description,
          categoryId: category._id,
          subcategoryId: testJob.subcategoryId,
          location: testJob.location,
          budget: testJob.budget,
          duration: testJob.duration,
          attachments: { images: [], documents: [] },
          guestCustomer: testJob.guestCustomer,
          status: 'approved', // Test verilerini onaylanmış olarak oluştur
          kvkkConsent: {
            accepted: true,
            acceptedAt: new Date(),
            ip: '127.0.0.1'
          }
        };

        const job = new Job(jobData);
        await job.save();
        createdJobs.push(job);
      } catch (jobError) {
        console.error(`Job oluşturma hatası (${testJob.title}):`, jobError);
      }
    }

    res.json({
      success: true,
      message: `${createdJobs.length} adet test iş ilanı başarıyla oluşturuldu`,
      createdCount: createdJobs.length,
      totalAttempted: testJobsData.length
    });

  } catch (error) {
    console.error('Test jobs creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Test verileri oluşturulurken hata oluştu'
    });
  }
};

module.exports = {
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
}; 