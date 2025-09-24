const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { deleteFromCloudinary, extractPublicIdFromUrl } = require('./uploadController');

// Stats'ı yeniden hesaplama fonksiyonu
const recalculateUserStats = async (userId) => {
  const Job = require('../models/Job');
  const Review = require('../models/Review');
  
  try {
    // Tamamlanan işleri say
    // Provider olarak tamamlanan işler: Kabul edilen teklifi bu user'a ait VE status completed
    const completedJobs = await Job.find({
      status: 'completed',
      acceptedProposal: { $exists: true }
    }).populate('proposals');
    
    const completedAsProvider = completedJobs.filter(job => {
      const acceptedProposal = job.proposals.find(p => p._id.toString() === job.acceptedProposal.toString());
      return acceptedProposal && acceptedProposal.providerId.toString() === userId.toString();
    }).length;
    
    // Customer olarak tamamlanan işler
    const completedAsCustomer = await Job.countDocuments({
      customerId: userId,
      status: 'completed'
    });
    
    const totalCompleted = completedAsProvider + completedAsCustomer;
    
    // Verilen ve alınan review sayıları
    const reviewsGiven = await Review.countDocuments({
      reviewerId: userId
    });
    
    const reviewsReceived = await Review.countDocuments({
      reviewedId: userId
    });
    
    // Kazanç hesaplama (provider olarak) - yukarıda bulunan completedJobs'u kullan
    const providerJobs = completedJobs.filter(job => {
      const acceptedProposal = job.proposals.find(p => p._id.toString() === job.acceptedProposal.toString());
      return acceptedProposal && acceptedProposal.providerId.toString() === userId.toString();
    });
    
    const totalEarnings = providerJobs.reduce((sum, job) => {
      const acceptedProposal = job.proposals.find(p => p._id.toString() === job.acceptedProposal.toString());
      return sum + (acceptedProposal?.price || 0);
    }, 0);
    
    // Harcama hesaplama (customer olarak)
    const customerJobs = await Job.find({
      customerId: userId,
      status: 'completed'
    });
    
    const totalSpent = customerJobs.reduce((sum, job) => {
      const acceptedProposal = job.proposals.find(p => p._id.toString() === job.acceptedProposal.toString());
      return sum + (acceptedProposal?.price || 0);
    }, 0);
    
    console.log(`Stats recalculated for user ${userId}:`, {
      completedJobs: totalCompleted,
      totalEarnings,
      totalSpent,
      reviewsGiven,
      reviewsReceived
    });
    
    return {
      completedJobs: totalCompleted,
      totalEarnings,
      totalSpent,
      reviewsGiven,
      reviewsReceived
    };
  } catch (error) {
    console.error('Error recalculating stats:', error);
    return null;
  }
};

// Kayıt
const register = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      phone, 
      role, 
      about,
      location,
      providerInfo,
      kvkkConsent 
    } = req.body;
    
    // Validasyon
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Ad, email ve şifre gerekli'
      });
    }

    if (!kvkkConsent || !kvkkConsent.accepted) {
      return res.status(400).json({
        success: false,
        message: 'KVKK onayı gerekli'
      });
    }

    // Email kontrolü
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu email adresi zaten kullanılıyor'
      });
    }

    // IP adresini al
    const userIP = req.ip || req.connection.remoteAddress || '127.0.0.1';

    // Kullanıcı verilerini hazırla
    const userData = {
      name,
      email,
      password,
      phone,
      role: role || 'customer',
      about,
      kvkkConsent: {
        accepted: kvkkConsent.accepted,
        acceptedAt: new Date(),
        ip: userIP
      }
    };

    // Location bilgisini ekle
    if (location) {
      userData.location = location;
    }

    // Provider bilgilerini ekle
    if (role === 'provider' && providerInfo) {
      userData.providerInfo = {
        services: providerInfo.services || [],
        experience: providerInfo.experience || 0,
        bio: providerInfo.bio || '',
        availableWorkDays: providerInfo.availableWorkDays || [],
        hourlyRate: providerInfo.hourlyRate || 0,
        rating: {
          average: 0,
          count: 0
        },
        portfolio: []
      };
    }

    // Kullanıcı oluştur
    const user = new User(userData);
    await user.save();

    // Token oluştur
    const token = generateToken(user._id);

    // Şifreyi response'tan çıkar
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Giriş
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email ve şifre gerekli'
      });
    }

    // Kullanıcıyı bul
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    // Şifre kontrolü
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    // Hesap aktif mi?
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Hesabınız askıya alınmış'
      });
    }

    // Son giriş tarihini güncelle
    await user.updateLastLogin();

    // Token oluştur
    const token = generateToken(user._id);

    // Şifreyi response'tan çıkar
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: 'Giriş başarılı',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Profil bilgilerini getir
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Profile get error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Profil bilgilerini güncelle
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const updates = req.body;
    console.log('UpdateProfile received updates:', JSON.stringify(updates, null, 2));
    
    // Eğer profil fotoğrafı güncellenmişse ve önceki fotoğraf varsa, eski fotoğrafı sil
    if (updates.profileImage !== undefined && user.profileImage && updates.profileImage !== user.profileImage) {
      try {
        const oldPublicId = extractPublicIdFromUrl(user.profileImage);
        if (oldPublicId) {
          const deleteResult = await deleteFromCloudinary(oldPublicId);
          console.log('Old profile image deletion result:', deleteResult);
        }
      } catch (error) {
        console.error('Error deleting old profile image:', error);
        // Eski fotoğraf silme hatası olsa bile devam et
      }
    }

    // Güncelleme işlemi
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        if (key === 'location' && typeof updates[key] === 'object') {
          // Location object'inin coordinates field'ını özel olarak kontrol et
          const locationUpdate = { ...updates[key] };
          
          // coordinates undefined, null veya invalid ise tamamen çıkar
          if (!locationUpdate.coordinates || 
              locationUpdate.coordinates === undefined || 
              locationUpdate.coordinates === null ||
              (typeof locationUpdate.coordinates === 'object' && 
               (!locationUpdate.coordinates.lat || !locationUpdate.coordinates.lng))) {
            delete locationUpdate.coordinates;
          }
          
          // Mevcut location'ı koru, sadece gelen field'ları güncelle
          user.location = {
            city: locationUpdate.city || user.location?.city,
            district: locationUpdate.district || user.location?.district,
            address: locationUpdate.address || user.location?.address,
            ...(locationUpdate.coordinates && {
              coordinates: {
                lat: locationUpdate.coordinates.lat,
                lng: locationUpdate.coordinates.lng
              }
            })
          };
              } else if (key === 'providerInfo' && typeof updates[key] === 'object') {
        // Provider info'yu merge et - undefined field'ları temizle
        const providerInfoUpdate = { ...updates[key] };
        
        console.log('ProviderInfo update before cleaning:', JSON.stringify(providerInfoUpdate, null, 2));
        
        // Undefined veya null field'ları kaldır (nested object'ler dahil)
        // Rating field'ını hiçbir zaman silme!
        const cleanObject = (obj) => {
          Object.keys(obj).forEach(field => {
            // Rating field'ını hiç dokunma
            if (field === 'rating') return;
            
            if (obj[field] === undefined || obj[field] === null) {
              delete obj[field];
            } else if (typeof obj[field] === 'object' && obj[field] !== null && !Array.isArray(obj[field])) {
              cleanObject(obj[field]);
              // Eğer nested object boş kaldıysa, onu da sil
              if (Object.keys(obj[field]).length === 0) {
                delete obj[field];
              }
            }
          });
        };
        
        cleanObject(providerInfoUpdate);
        
        console.log('ProviderInfo update after cleaning:', JSON.stringify(providerInfoUpdate, null, 2));
        console.log('Current user providerInfo:', JSON.stringify(user.providerInfo, null, 2));
        
        // Services özellikle kontrol et
        if (providerInfoUpdate.services) {
          console.log('Services being updated:', JSON.stringify(providerInfoUpdate.services, null, 2));
        }
        
        // Mevcut providerInfo'yu koru, sadece gelen field'ları güncelle
        // Rating field'ını hiç dokunma, sadece gelen field'ları update et
        Object.keys(providerInfoUpdate).forEach(field => {
          if (field !== 'rating') { // Rating'i hiç güncelleme
            user.providerInfo[field] = providerInfoUpdate[field];
          }
        });
        
        console.log('Final user providerInfo:', JSON.stringify(user.providerInfo, null, 2));
        } else if (key === 'about' || key === 'name' || key === 'phone') {
          // Basit field'lar
          user[key] = updates[key];
        } else {
          user[key] = updates[key];
        }
      }
    });

    await user.save();

    // Stats'ı yeniden hesapla
    const newStats = await recalculateUserStats(user._id);
    if (newStats) {
      await User.findByIdAndUpdate(user._id, { stats: newStats });
    }

    // Şifreyi response'dan çıkar
    const updatedUser = await User.findById(user._id).select('-password');

    console.log('User stats after update:', updatedUser.stats);

    res.json({
      success: true,
      message: 'Profil başarıyla güncellendi',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Profil güncellenirken hata oluştu' });
  }
};

// Rol değiştir (customer <-> provider)
const changeRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !['customer', 'provider'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir rol seçin (customer/provider)'
      });
    }

    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin rolü değiştirilemez
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin rolü değiştirilemez'
      });
    }

    user.role = role;
    await user.save();

    // Güncellenmiş kullanıcı bilgilerini döndür
    const updatedUser = await User.findById(req.userId).select('-password');

    res.json({
      success: true,
      message: 'Rol başarıyla değiştirildi',
      user: updatedUser
    });

  } catch (error) {
    console.error('Role change error:', error);
    res.status(500).json({
      success: false,
      message: 'Rol değiştirilirken hata oluştu'
    });
  }
};

// Public kullanıcı profili
const getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const Job = require('../models/Job');
    const Review = require('../models/Review');

    const user = await User.findById(userId)
      .select('-password -email -phone -kvkkConsent')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Stats hesapla
    const stats = {
      completedJobs: 0,
      reviewsReceived: 0,
      averageRating: 0,
      totalEarnings: 0
    };

    if (user.role === 'customer') {
      // Müşteri olarak tamamladığı işler
      stats.completedJobs = await Job.countDocuments({
        customerId: userId,
        status: 'completed'
      });
      
      // Müşteri olarak aldığı değerlendirmeler
      const customerReviews = await Review.find({ reviewedId: userId });
      stats.reviewsReceived = customerReviews.length;
      
      if (customerReviews.length > 0) {
        const totalRating = customerReviews.reduce((sum, review) => sum + review.rating, 0);
        stats.averageRating = totalRating / customerReviews.length;
      }
    } else if (user.role === 'provider') {
      // Yeni Proposal collection'ını kullan
      const Proposal = require('../models/Proposal');
      
      // Hizmet veren olarak kabul edilen teklifleri bul
      const acceptedProposals = await Proposal.find({
        providerId: userId,
        status: 'accepted'
      }).populate('jobId');
      
      // Tamamlanmış işler (kabul edilen proposal'ları olan ve completed status'lu joblar)
      const completedJobIds = acceptedProposals
        .filter(proposal => proposal.jobId && proposal.jobId.status === 'completed')
        .map(proposal => proposal.jobId._id);
        
      stats.completedJobs = completedJobIds.length;
      
      // Hizmet veren olarak aldığı değerlendirmeler
      const providerReviews = await Review.find({ reviewedId: userId });
      stats.reviewsReceived = providerReviews.length;
      
      if (providerReviews.length > 0) {
        const totalRating = providerReviews.reduce((sum, review) => sum + review.rating, 0);
        stats.averageRating = totalRating / providerReviews.length;
      }

      // Toplam kazanç (kabul edilen ve tamamlanmış tekliflerin fiyatları)
      stats.totalEarnings = acceptedProposals
        .filter(proposal => proposal.jobId && proposal.jobId.status === 'completed')
        .reduce((total, proposal) => total + proposal.price, 0);
    }

    // User'a stats ekle
    user.stats = stats;

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Public profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Profil getirilirken hata oluştu'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changeRole,
  getPublicProfile
}; 