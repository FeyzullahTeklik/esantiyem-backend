const Review = require('../models/Review');
const Job = require('../models/Job');
const User = require('../models/User');

// Değerlendirme oluşturma
const createReview = async (req, res) => {
  try {
    const { jobId, reviewedId, rating, comment } = req.body;

    // İş var mı kontrol et
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'İş bulunamadı'
      });
    }

    // İş tamamlanmış mı kontrol et
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Sadece tamamlanmış işler için değerlendirme yapılabilir'
      });
    }

    // Değerlendiren kişi bu işte müşteri veya provider mı kontrol et
    let reviewerType;
    if (job.customerId && job.customerId.toString() === req.userId) {
      reviewerType = 'customer';
    } else {
      // Kabul edilen proposal'ın providerId'si mi (yeni Proposal collection'dan)
      const Proposal = require('../models/Proposal');
      const acceptedProposal = await Proposal.findById(job.acceptedProposal);
      if (acceptedProposal && acceptedProposal.providerId.toString() === req.userId) {
        reviewerType = 'provider';
      } else {
        return res.status(403).json({
          success: false,
          message: 'Bu iş için değerlendirme yapma yetkiniz yok'
        });
      }
    }

    // Daha önce değerlendirme yapmış mı kontrol et
    const existingReview = await Review.findOne({
      jobId,
      reviewerId: req.userId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Bu iş için zaten değerlendirme yapmışsınız'
      });
    }

    // Değerlendirme oluştur
    const review = new Review({
      jobId,
      reviewerId: req.userId,
      reviewedId,
      rating,
      comment,
      reviewerType
    });

    await review.save();

    // Değerlendirilen kullanıcının rating'ini güncelle
    await updateUserRating(reviewedId);

    // İstatistikleri güncelle
    await User.findByIdAndUpdate(req.userId, {
      $inc: { 'stats.reviewsGiven': 1 }
    });

    await User.findByIdAndUpdate(reviewedId, {
      $inc: { 'stats.reviewsReceived': 1 }
    });

    // Review'i populate ederek döndür
    await review.populate('reviewerId', 'name profileImage');
    await review.populate('reviewedId', 'name profileImage');

    res.json({
      success: true,
      message: 'Değerlendirme başarıyla oluşturuldu',
      review
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Değerlendirme oluşturulurken hata oluştu'
    });
  }
};

// Kullanıcının rating'ini yeniden hesapla
const updateUserRating = async (userId) => {
  try {
    const reviews = await Review.find({ reviewedId: userId });
    
    if (reviews.length === 0) {
      await User.findByIdAndUpdate(userId, {
        'providerInfo.rating.average': 0,
        'providerInfo.rating.count': 0
      });
      return;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = totalRating / reviews.length;

    await User.findByIdAndUpdate(userId, {
      'providerInfo.rating.average': average,
      'providerInfo.rating.count': reviews.length
    });

  } catch (error) {
    console.error('Update user rating error:', error);
  }
};

// Bir iş için değerlendirmeleri getir
const getJobReviews = async (req, res) => {
  try {
    const { jobId } = req.params;

    const reviews = await Review.find({ jobId })
      .populate('reviewerId', 'name profileImage role')
      .populate('reviewedId', 'name profileImage role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      reviews
    });

  } catch (error) {
    console.error('Get job reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Değerlendirmeler getirilirken hata oluştu'
    });
  }
};

// Kullanıcı için değerlendirmeleri getir
const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const reviews = await Review.find({ reviewedId: userId })
      .populate('reviewerId', 'name profileImage role')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ reviewedId: userId });

    res.json({
      success: true,
      reviews,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı değerlendirmeleri getirilirken hata oluştu'
    });
  }
};

// Tamamlanan işleri getir
const getCompletedJobs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const Proposal = require('../models/Proposal');

    const skip = (page - 1) * limit;

    // Kullanıcının müşteri olarak tamamladığı işler
    const customerJobs = await Job.find({ 
      customerId: userId, 
      status: 'completed' 
    })
    .populate('categoryId', 'name')
    .sort({ deliveredAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    // Kullanıcının provider olarak tamamladığı işler (yeni Proposal collection'dan)
    // Önce tüm accepted proposal'ları al
    const allAcceptedProposals = await Proposal.find({
      providerId: userId,
      status: 'accepted'
    });

    // Bu proposal'ların job ID'lerini al
    const acceptedJobIds = allAcceptedProposals.map(p => p.jobId);
    
    // Completed job'ları bul
    const providerJobs = await Job.find({
      _id: { $in: acceptedJobIds },
      status: 'completed'
    })
    .populate('categoryId', 'name')
    .populate('customerId', 'name profileImage')
    .sort({ deliveredAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    // Customer jobs için review durumunu kontrol et
    const customerJobsWithReviews = await Promise.all(
      customerJobs.map(async (job) => {
        const jobObj = job.toObject();
        
        if (jobObj.acceptedProposal) {
          // Kabul edilen proposal'ı yeni collection'dan al
          const acceptedProposal = await Proposal.findById(jobObj.acceptedProposal)
            .populate('providerId', 'name profileImage');
          
          if (acceptedProposal) {
            // Müşterinin provider'ı değerlendirip değerlendirmediğini kontrol et
            const customerReview = await Review.findOne({
              jobId: job._id,
              reviewerId: userId
            });
            
            // Provider'ın müşteriyi değerlendirip değerlendirmediğini kontrol et
            const providerReview = await Review.findOne({
              jobId: job._id,
              reviewerId: acceptedProposal.providerId._id
            });

            jobObj.canReview = !customerReview;
            jobObj.hasProviderReview = !!providerReview;
            jobObj.acceptedProvider = acceptedProposal.providerId;
          }
        }
        
        return jobObj;
      })
    );

    const providerJobsWithReviews = await Promise.all(
      providerJobs.map(async (job) => {
        const jobObj = job.toObject();
        
        // Provider'ın müşteriyi değerlendirip değerlendirmediğini kontrol et
        const providerReview = await Review.findOne({
          jobId: job._id,
          reviewerId: userId
        });
        
        // Müşterinin provider'ı değerlendirip değerlendirmediğini kontrol et
        const customerReview = await Review.findOne({
          jobId: job._id,
          reviewerId: jobObj.customerId._id
        });

        jobObj.canReview = !providerReview;
        jobObj.hasCustomerReview = !!customerReview;
        
        return jobObj;
      })
    );

    const total = customerJobs.length + providerJobs.length;

    res.json({
      success: true,
      completedJobs: {
        asCustomer: customerJobsWithReviews,
        asProvider: providerJobsWithReviews
      },
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get completed jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Tamamlanan işler getirilirken hata oluştu'
    });
  }
};

// Admin tarafından değerlendirme silme
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Review'i bul
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Değerlendirme bulunamadı'
      });
    }

    // Review'i sil
    await Review.findByIdAndDelete(reviewId);

    // Değerlendirilen kullanıcının rating'ini güncelle
    await updateUserRating(review.reviewedId);

    // İstatistikleri güncelle
    await User.findByIdAndUpdate(review.reviewerId, {
      $inc: { 'stats.reviewsGiven': -1 }
    });

    await User.findByIdAndUpdate(review.reviewedId, {
      $inc: { 'stats.reviewsReceived': -1 }
    });

    res.json({
      success: true,
      message: 'Değerlendirme başarıyla silindi'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Değerlendirme silinirken hata oluştu'
    });
  }
};

module.exports = {
  createReview,
  getJobReviews,
  getUserReviews,
  getCompletedJobs,
  deleteReview
}; 