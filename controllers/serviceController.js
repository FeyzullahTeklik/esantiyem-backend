const Service = require('../models/Service');
const Category = require('../models/Category');
const User = require('../models/User');
const { deleteFromCloudinary, extractPublicIdFromUrl } = require('./uploadController');

// Hizmet ilanı oluşturma (Provider için)
const createService = async (req, res) => {
  try {
    const {
      title,
      description,
      categoryId,
      subcategoryId,
      pricing,
      serviceAreas,
      coverImage
    } = req.body;

    // Validasyon
    if (!title || !description || !categoryId || !pricing?.amount) {
      return res.status(400).json({
        success: false,
        message: 'Başlık, açıklama, kategori ve fiyat bilgisi gerekli'
      });
    }

    // Provider kontrolü
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem sadece hizmet verenler tarafından yapılabilir'
      });
    }

    // Kategori kontrolü
    const category = await Category.findById(categoryId);
    if (!category || !category.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kategori'
      });
    }

    // Subcategory kontrolü - eğer kategori active subcategorilere sahipse gerekli
    const activeSubcategories = category.subcategories?.filter(sub => sub.isActive) || [];
    if (activeSubcategories.length > 0 && (!subcategoryId || subcategoryId.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Bu kategori için alt kategori seçimi gerekli'
      });
    }

    // Eğer subcategory yoksa 'general' yap
    const finalSubcategoryId = (!subcategoryId || subcategoryId.trim() === '') ? 'general' : subcategoryId;

    const serviceData = {
      title,
      description,
      categoryId,
      subcategoryId: finalSubcategoryId,
      providerId: req.userId,
      pricing,
      serviceAreas: serviceAreas || [],
      status: 'approved' // Hizmetler otomatik onaylanır
    };

    // CoverImage varsa ekle
    if (coverImage) {
      serviceData.coverImage = coverImage;
    }

    const service = new Service(serviceData);
    await service.save();

    // Service'i populate ederek döndür
    const populatedService = await Service.findById(service._id)
      .populate('categoryId', 'name icon')
      .populate('providerId', 'name profileImage location phone email');

    res.status(201).json({
      success: true,
      message: 'Hizmet ilanı oluşturuldu, admin onayı bekleniyor',
      service: populatedService
    });

  } catch (error) {
    console.error('Service creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet ilanı oluşturulurken hata oluştu'
    });
  }
};

// Hizmet ilanlarını listeleme (Public)
const getServices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      city,
      district,
      search,
      priceMin,
      priceMax,
      sortBy = 'newest'
    } = req.query;

    // Filtre oluştur - Sadece onaylanmış hizmetler
    const filter = { status: 'approved' };

    if (category) {
      filter.categoryId = category;
    }

    if (city) {
      filter['serviceAreas.city'] = city;
    }

    // İlçe filtresi (opsiyonel)
    if (district) {
      // Herhangi bir hizmet alanında ilgili ilçe bulunmalı
      filter['serviceAreas.districts'] = district;
    }

    if (priceMin || priceMax) {
      filter['pricing.amount'] = {};
      if (priceMin) filter['pricing.amount'].$gte = parseFloat(priceMin);
      if (priceMax) filter['pricing.amount'].$lte = parseFloat(priceMax);
    }

    // Arama
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Sıralama
    let sortOptions = { createdAt: -1 }; // Default: newest
    switch (sortBy) {
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'price_low':
        sortOptions = { 'pricing.amount': 1 };
        break;
      case 'price_high':
        sortOptions = { 'pricing.amount': -1 };
        break;
      case 'most_viewed':
        sortOptions = { 'stats.views': -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Sayfalama
    const skip = (page - 1) * limit;

    // Hizmetleri getir
    const services = await Service.find(filter)
      .populate('categoryId', 'name icon')
      .populate('providerId', 'name profileImage location phone email providerInfo.rating')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Toplam sayı
    const total = await Service.countDocuments(filter);

    res.json({
      success: true,
      services,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmetler listelenirken hata oluştu'
    });
  }
};

// Tek hizmet detayı
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findById(id)
      .populate('categoryId', 'name icon')
      .populate('providerId', 'name profileImage location phone email about providerInfo');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    // Sadece onaylanmış hizmetler public olarak görülebilir
    if (service.status !== 'approved' && service.providerId._id.toString() !== req.userId) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    // Görüntülenme sayısını artır (sadece farklı kullanıcılar için)
    if (service.providerId._id.toString() !== req.userId) {
      await Service.findByIdAndUpdate(id, { $inc: { 'stats.views': 1 } });
    }

    res.json({
      success: true,
      service
    });

  } catch (error) {
    console.error('Get service by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet detayı alınırken hata oluştu'
    });
  }
};

// Provider'ın hizmetleri
const getMyServices = async (req, res) => {
  try {
    const services = await Service.find({ providerId: req.userId })
      .populate('categoryId', 'name icon')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error('Get my services error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmetleriniz listelenirken hata oluştu'
    });
  }
};

// Hizmet güncelleme
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Service sahibi kontrolü
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    if (service.providerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu hizmeti güncelleme yetkiniz yok'
      });
    }

    // Güncelleme yapılabilir alanlar
    const allowedUpdates = [
      'title', 'description', 'categoryId', 'subcategoryId', 'pricing', 'serviceAreas'
    ];
    
    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    // Güncelleme sonrası da otomatik onaylı kalır
    // updateData.status = 'pending'; // Artık tekrar onay gerekmiyor

    const updatedService = await Service.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('categoryId', 'name icon');

    res.json({
      success: true,
      message: 'Hizmet güncellendi',
      service: updatedService
    });

  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet güncellenirken hata oluştu'
    });
  }
};

// Hizmet silme
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    if (service.providerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu hizmeti silme yetkiniz yok'
      });
    }

    // Kapak görselini sil
    if (service.coverImage) {
      try {
        await deleteFromCloudinary(service.coverImage);
      } catch (error) {
        console.error('Error deleting cover image:', error);
      }
    }

    await Service.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Hizmet silindi'
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet silinirken hata oluştu'
    });
  }
};

// Kapak görseli güncelleme
const updateCoverImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { coverImage } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    if (service.providerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu hizmeti güncelleme yetkiniz yok'
      });
    }

    // Eski görseli sil
    if (service.coverImage) {
      try {
        await deleteFromCloudinary(service.coverImage);
      } catch (error) {
        console.error('Error deleting old cover image:', error);
      }
    }

    service.coverImage = coverImage;
    await service.save();

    res.json({
      success: true,
      message: 'Kapak görseli güncellendi',
      service
    });

  } catch (error) {
    console.error('Update cover image error:', error);
    res.status(500).json({
      success: false,
      message: 'Kapak görseli güncellenirken hata oluştu'
    });
  }
};

// Hizmet iletişim sayısını artır
const incrementContactCount = async (req, res) => {
  try {
    const { id } = req.params;

    await Service.findByIdAndUpdate(id, { $inc: { 'stats.contactCount': 1 } });

    res.json({
      success: true,
      message: 'İletişim sayısı güncellendi'
    });

  } catch (error) {
    console.error('Increment contact count error:', error);
    res.status(500).json({
      success: false,
      message: 'İletişim sayısı güncellenirken hata oluştu'
    });
  }
};

// Admin için tüm hizmetleri listeleme
const getAllServicesForAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      search,
      fromDate
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (category) {
      filter.categoryId = category;
    }

    if (fromDate) {
      filter.createdAt = { $gte: new Date(fromDate) };
    }

    let services;
    let total;

    if (search) {
      // Arama için tüm hizmetleri getir
      const allServices = await Service.find()
        .populate('categoryId', 'name icon')
        .populate('providerId', 'name email profileImage location phone')
        .lean();

      // JavaScript ile filtreleme
      let filteredServices = allServices.filter(service => {
        const searchLower = search.toLowerCase();
        const categoryName = service.categoryId?.name || '';
        const providerName = service.providerId?.name || '';
        
        return service.title.toLowerCase().includes(searchLower) ||
               service.description.toLowerCase().includes(searchLower) ||
               categoryName.toLowerCase().includes(searchLower) ||
               providerName.toLowerCase().includes(searchLower);
      });

      // Diğer filtreleri uygula
      if (status) {
        filteredServices = filteredServices.filter(service => service.status === status);
      }

      if (category) {
        filteredServices = filteredServices.filter(service => 
          service.categoryId?._id.toString() === category
        );
      }

      // Sıralama
      filteredServices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Pagination
      total = filteredServices.length;
      const skip = (page - 1) * limit;
      services = filteredServices.slice(skip, skip + parseInt(limit));
    } else {
      // Normal filtreleme
      const skip = (page - 1) * limit;

      services = await Service.find(filter)
        .populate('categoryId', 'name icon')
        .populate('providerId', 'name email profileImage location phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      total = await Service.countDocuments(filter);
    }

    // İstatistikleri hesapla
    const stats = {
      pending: await Service.countDocuments({ status: 'pending' }),
      approved: await Service.countDocuments({ status: 'approved' }),
      rejected: await Service.countDocuments({ status: 'rejected' }),
      inactive: await Service.countDocuments({ status: 'inactive' }),
      totalViews: await Service.aggregate([
        { $group: { _id: null, total: { $sum: '$stats.views' } } }
      ]).then(result => result[0]?.total || 0),
      totalContacts: await Service.aggregate([
        { $group: { _id: null, total: { $sum: '$stats.contactCount' } } }
      ]).then(result => result[0]?.total || 0)
    };

    res.json({
      success: true,
      services,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      },
      stats
    });

  } catch (error) {
    console.error('Get all services for admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmetler listelenirken hata oluştu'
    });
  }
};

// Admin - Hizmet durumu güncelleme
const updateServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'approved', 'rejected', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz durum'
      });
    }

    const service = await Service.findByIdAndUpdate(
      id,
      { 
        status,
        adminNotes: adminNotes || '',
        updatedAt: new Date()
      },
      { new: true }
    ).populate('categoryId', 'name').populate('providerId', 'name email');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Hizmet durumu güncellendi',
      service
    });

  } catch (error) {
    console.error('Update service status error:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet durumu güncellenirken hata oluştu'
    });
  }
};

module.exports = {
  createService,
  getServices,
  getServiceById,
  getMyServices,
  updateService,
  deleteService,
  updateCoverImage,
  incrementContactCount,
  getAllServicesForAdmin,
  updateServiceStatus
}; 