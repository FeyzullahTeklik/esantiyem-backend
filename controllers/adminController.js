const User = require('../models/User');
const Job = require('../models/Job');
const { deleteUserFiles, deleteJobFiles } = require('./uploadController');

// Tüm kullanıcıları listele
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcılar yüklenirken hata oluştu'
    });
  }
};

// Kullanıcı durumunu değiştir (aktif/pasif)
const toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive değeri boolean olmalı'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin kullanıcıları pasifleştirilemez
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin kullanıcıları pasifleştirilemez'
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `Kullanıcı ${isActive ? 'aktifleştirildi' : 'pasifleştirildi'}`,
      user: {
        _id: user._id,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı durumu değiştirilirken hata oluştu'
    });
  }
};

// Kullanıcı detaylarını getir
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    
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
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı detayları yüklenirken hata oluştu'
    });
  }
};

// Kullanıcı rolünü değiştir (admin tarafından)
const changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['customer', 'provider', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir rol seçin (customer/provider/admin)'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    user.role = role;
    await user.save();

    const updatedUser = await User.findById(userId).select('-password');

    res.json({
      success: true,
      message: 'Kullanıcı rolü başarıyla değiştirildi',
      user: updatedUser
    });

  } catch (error) {
    console.error('Change user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı rolü değiştirilirken hata oluştu'
    });
  }
};

// Kullanıcı bilgilerini güncelle (admin tarafından)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      name, 
      phone, 
      about, 
      location,
      role,
      isActive,
      isEmailVerified,
      profileImage,
      providerInfo 
    } = req.body;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Güncellenebilir alanları güncelle
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (about !== undefined) user.about = about;
    if (location !== undefined) user.location = location;
    if (role !== undefined && ['customer', 'provider', 'admin'].includes(role)) {
      user.role = role;
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;
    if (profileImage !== undefined) user.profileImage = profileImage;
    
    // Hizmet veren bilgileri
    if (providerInfo && (user.role === 'provider' || user.role === 'admin')) {
      if (!user.providerInfo) {
        user.providerInfo = {};
      }
      
      Object.keys(providerInfo).forEach(key => {
        if (providerInfo[key] !== undefined) {
          user.providerInfo[key] = providerInfo[key];
        }
      });
    }

    await user.save();

    // Güncellenmiş kullanıcı bilgilerini döndür
    const updatedUser = await User.findById(userId).select('-password');

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla güncellendi',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı güncellenirken hata oluştu'
    });
  }
};

// Yeni kullanıcı oluştur (admin tarafından)
const createUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      phone, 
      role, 
      about,
      location,
      isActive = true,
      isEmailVerified = false 
    } = req.body;
    
    // Validasyon
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Ad, email ve şifre gerekli'
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

    // Kullanıcı oluştur
    const user = new User({
      name,
      email,
      password,
      phone,
      role: role || 'customer',
      about,
      location,
      isActive,
      isEmailVerified,
      kvkkConsent: {
        accepted: true,
        acceptedAt: new Date(),
        ip: userIP
      }
    });

    await user.save();

    // Şifreyi response'tan çıkar
    const userResponse = await User.findById(user._id).select('-password');

    res.status(201).json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu',
      user: userResponse
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı oluşturulurken hata oluştu'
    });
  }
};

// Kullanıcı silme
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin kullanıcıları silinemez
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin kullanıcıları silinemez'
      });
    }

    // Kullanıcının iş ilanlarını bul ve sil
    try {
      const userJobs = await Job.find({ customerId: userId });
      console.log(`Found ${userJobs.length} jobs for user ${userId}`);
      
      // Her iş ilanının dosyalarını sil
      for (const job of userJobs) {
        try {
          await deleteJobFiles(job._id.toString());
          console.log(`Deleted files for job ${job._id}`);
        } catch (error) {
          console.error(`Error deleting files for job ${job._id}:`, error);
        }
      }
      
      // İş ilanlarını veritabanından sil
      await Job.deleteMany({ customerId: userId });
      console.log(`Deleted ${userJobs.length} jobs for user ${userId}`);
    } catch (error) {
      console.error('Error deleting user jobs:', error);
    }

    // Kullanıcının kişisel dosyalarını sil (profil fotoğrafı vs.)
    try {
      const deleteResult = await deleteUserFiles(userId);
      console.log('User files deletion result:', deleteResult);
    } catch (error) {
      console.error('User files deletion error:', error);
      // Dosya silme hatası olsa bile kullanıcıyı silmeye devam et
    }

    // Kullanıcıyı veritabanından sil
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Kullanıcı, ilanları ve dosyaları başarıyla silindi'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı silinirken hata oluştu'
    });
  }
};

// Sistem istatistikleri
const getSystemStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const customers = await User.countDocuments({ role: 'customer' });
    const providers = await User.countDocuments({ role: 'provider' });
    const admins = await User.countDocuments({ role: 'admin' });
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });

    // Son 30 günde kayıt olan kullanıcılar
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // İş ilanı istatistikleri
    const totalJobs = await Job.countDocuments();
    const activeJobs = await Job.countDocuments({ status: 'approved' });
    const pendingJobs = await Job.countDocuments({ status: 'pending' });
    const completedJobs = await Job.countDocuments({ status: 'completed' });

    // Son 30 günde oluşturulan ilanlar
    const recentJobs = await Job.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Son aktiviteler (son 10 kullanıcı ve ilan)
    const recentUsersList = await User.find({})
      .select('name email role createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentJobsList = await Job.find({})
      .select('title status createdAt customerId')
      .populate('customerId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          customers,
          providers,
          admins,
          verified: verifiedUsers,
          recent: recentUsers,
          inactive: totalUsers - activeUsers,
          unverified: totalUsers - verifiedUsers
        },
        jobs: {
          total: totalJobs,
          active: activeJobs,
          pending: pendingJobs,
          completed: completedJobs,
          recent: recentJobs
        },
        activities: {
          recentUsers: recentUsersList,
          recentJobs: recentJobsList
        }
      }
    });

  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Sistem istatistikleri yüklenirken hata oluştu'
    });
  }
};

module.exports = {
  getAllUsers,
  toggleUserStatus,
  getUserDetails,
  changeUserRole,
  updateUser,
  createUser,
  deleteUser,
  getSystemStats
}; 