const multer = require('multer');
const { CloudinaryApi } = require('cloudinary');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');

// Cloudinary konfigürasyonu
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary konfigürasyonunu test et
console.log('Cloudinary Config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
  api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing'
});

// Multer konfigürasyonu (memory storage)
const storage = multer.memoryStorage();

// Profil fotoğrafları için multer
const uploadProfile = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Sadece resim dosyalarına izin ver
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir'), false);
    }
  }
});

// Job attachments için multer (çoklu dosya)
const uploadJobFiles = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Resim ve dokuman dosyalarına izin ver
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya türü'), false);
    }
  }
});

// Profil fotoğrafı yükleme
const uploadProfileImage = async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('User from token:', req.user);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya seçilmedi'
      });
    }

    // userId kontrolü
    if (!req.userId) {
      console.error('User ID not found in request. req.user:', req.user, 'req.userId:', req.userId);
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı kimliği bulunamadı'
      });
    }

    const userId = req.userId;
    console.log('Using userId:', userId);

    // Cloudinary konfigürasyonu kontrolü
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      return res.status(500).json({
        success: false,
        message: 'Dosya yükleme servisi yapılandırılmamış'
      });
    }

    // Cloudinary'ye yükle - user klasör yapısı
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `esantiyem/users/${userId}/profile`,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' }
          ],
          public_id: `profile_${Date.now()}`,
          overwrite: true
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('Cloudinary upload success:', result.secure_url);
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    // Kullanıcının profil resmini veritabanında güncelle
    const User = require('../models/User');
    await User.findByIdAndUpdate(userId, {
      profileImage: result.secure_url
    });

    console.log('Profile image updated in database');

    res.json({
      success: true,
      message: 'Profil fotoğrafı başarıyla yüklendi',
      imageUrl: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Dosya yüklenirken hata oluştu'
    });
  }
};

// Job attachments yükleme
const uploadJobAttachments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dosya seçilmedi'
      });
    }

    const userId = req.userId || 'guest';
    const jobId = req.body.jobId || `temp_${Date.now()}`;

    console.log('Job attachments upload - userId:', userId, 'jobId:', jobId);

    const uploadPromises = req.files.map(async (file) => {
      const isImage = file.mimetype.startsWith('image/');
      const folder = `esantiyem/jobs/${jobId}/${isImage ? 'images' : 'documents'}`;
      
      return new Promise((resolve, reject) => {
        const uploadOptions = {
          folder,
          public_id: `${isImage ? 'img' : 'doc'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          resource_type: isImage ? 'image' : 'raw'
        };

        // Resimler için transformation ekle
        if (isImage) {
          uploadOptions.transformation = [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto' }
          ];
        }

        cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error('Cloudinary job upload error:', error);
              reject(error);
            } else {
              console.log('Cloudinary job upload success:', result.secure_url);
              resolve({
                name: file.originalname,
                url: result.secure_url,
                publicId: result.public_id,
                type: file.mimetype,
                size: file.size,
                isImage
              });
            }
          }
        ).end(file.buffer);
      });
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    // Dosyaları kategorilere ayır
    const images = uploadedFiles.filter(f => f.isImage).map(f => f.url);
    const documents = uploadedFiles.filter(f => !f.isImage).map(f => ({
      name: f.name,
      url: f.url,
      type: f.type,
      size: f.size
    }));

    res.json({
      success: true,
      message: 'Dosyalar başarıyla yüklendi',
      attachments: {
        images,
        documents
      },
      uploadedFiles
    });

  } catch (error) {
    console.error('Upload job attachments error:', error);
    res.status(500).json({
      success: false,
      message: 'Dosyalar yüklenirken hata oluştu'
    });
  }
};

// Genel dosya yükleme
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya seçilmedi'
      });
    }

    const { type = 'general', userId } = req.body;
    const userIdToUse = userId || req.userId || req.user?._id;
    
    if (!userIdToUse) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı kimliği bulunamadı'
      });
    }
    
    let folder = 'esantiyem/general';
    let transformation = [{ quality: 'auto' }];

    // Dosya tipine göre klasör ve transformation ayarla
    switch (type) {
      case 'profile':
        folder = `esantiyem/users/${userIdToUse}/profile`;
        transformation = [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto' }
        ];
        break;
      case 'service-cover':
        folder = `esantiyem/users/${userIdToUse}/services`;
        transformation = [
          { width: 1200, height: 800, crop: 'fill' },
          { quality: 'auto' }
        ];
        break;
      case 'job-attachment':
        folder = `esantiyem/jobs/${req.body.jobId || 'temp'}/attachments`;
        transformation = [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' }
        ];
        break;
      default:
        folder = 'esantiyem/general';
    }

    // Cloudinary'ye yükle
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder,
          transformation,
          public_id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    res.json({
      success: true,
      message: 'Dosya başarıyla yüklendi',
      url: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      message: 'Dosya yüklenirken hata oluştu'
    });
  }
};

// Dosya silme
const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID gerekli'
      });
    }

    // Cloudinary'den sil
    const result = await cloudinary.uploader.destroy(publicId);

    res.json({
      success: true,
      message: 'Dosya başarıyla silindi',
      result
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Dosya silinirken hata oluştu'
    });
  }
};

// Cloudinary'den dosya silme utility fonksiyonu
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return { success: false, message: 'Public ID bulunamadı' };
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Cloudinary delete result:', result);
    
    return { 
      success: result.result === 'ok' || result.result === 'not found', 
      result: result.result 
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
};

// Cloudinary'den klasörü silme utility fonksiyonu
const deleteFolderFromCloudinary = async (folderPath) => {
  try {
    if (!folderPath) return { success: false, message: 'Klasör yolu bulunamadı' };
    
    // Önce klasördeki tüm dosyaları listele
    const resources = await cloudinary.api.resources({
      type: 'upload',
      prefix: folderPath,
      max_results: 500
    });
    
    if (resources.resources && resources.resources.length > 0) {
      // Tüm dosyaları sil
      const publicIds = resources.resources.map(resource => resource.public_id);
      const deleteResult = await cloudinary.api.delete_resources(publicIds);
      console.log('Bulk delete result:', deleteResult);
    }
    
    // Klasörü sil
    const folderResult = await cloudinary.api.delete_folder(folderPath);
    console.log('Folder delete result:', folderResult);
    
    return { success: true, message: 'Klasör başarıyla silindi' };
  } catch (error) {
    console.error('Cloudinary folder delete error:', error);
    return { success: false, error: error.message };
  }
};

// Kullanıcının tüm dosyalarını silme fonksiyonu
const deleteUserFiles = async (userId) => {
  try {
    const userFolderPath = `esantiyem/users/${userId}`;
    const result = await deleteFolderFromCloudinary(userFolderPath);
    console.log(`User ${userId} files deletion result:`, result);
    return result;
  } catch (error) {
    console.error('Delete user files error:', error);
    return { success: false, error: error.message };
  }
};

// İş ilanının tüm dosyalarını silme fonksiyonu
const deleteJobFiles = async (jobId) => {
  try {
    const jobFolderPath = `esantiyem/jobs/${jobId}`;
    const result = await deleteFolderFromCloudinary(jobFolderPath);
    console.log(`Job ${jobId} files deletion result:`, result);
    return result;
  } catch (error) {
    console.error('Delete job files error:', error);
    return { success: false, error: error.message };
  }
};

// Blog cover image yükleme
const uploadBlogCover = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya seçilmedi'
      });
    }

    const blogId = req.body.blogId || `temp_${Date.now()}`;
    
    // Cloudinary'ye yükle
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `esantiyem/blog/${blogId}`,
          transformation: [
            { width: 1200, height: 630, crop: 'fill', gravity: 'auto' },
            { quality: 'auto' }
          ],
          public_id: `cover_${Date.now()}`
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary blog cover upload error:', error);
            reject(error);
          } else {
            console.log('Cloudinary blog cover upload success:', result.secure_url);
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    res.json({
      success: true,
      message: 'Blog kapak görseli başarıyla yüklendi',
      url: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Upload blog cover error:', error);
    res.status(500).json({
      success: false,
      message: 'Görsel yüklenirken hata oluştu'
    });
  }
};

// Blog'un tüm dosyalarını silme fonksiyonu
const deleteBlogFiles = async (blogId) => {
  try {
    const blogFolderPath = `esantiyem/blog/${blogId}`;
    const result = await deleteFolderFromCloudinary(blogFolderPath);
    console.log(`Blog ${blogId} files deletion result:`, result);
    return result;
  } catch (error) {
    console.error('Delete blog files error:', error);
    return { success: false, error: error.message };
  }
};

// Public ID'den Cloudinary URL'si çıkarma utility fonksiyonu
const extractPublicIdFromUrl = (url) => {
  try {
    if (!url || !url.includes('cloudinary.com')) return null;
    
    const parts = url.split('/');
    const uploadIndex = parts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) return null;
    
    // Version varsa atla
    let startIndex = uploadIndex + 1;
    if (parts[startIndex] && parts[startIndex].startsWith('v')) {
      startIndex++;
    }
    
    // Dosya uzantısını kaldır
    const publicIdParts = parts.slice(startIndex);
    const lastPart = publicIdParts[publicIdParts.length - 1];
    const withoutExtension = lastPart.split('.')[0];
    publicIdParts[publicIdParts.length - 1] = withoutExtension;
    
    return publicIdParts.join('/');
  } catch (error) {
    console.error('Extract public ID error:', error);
    return null;
  }
};

module.exports = {
  uploadProfile,
  uploadJobFiles,
  uploadProfileImage,
  uploadJobAttachments,
  uploadFile,
  uploadBlogCover,
  deleteFromCloudinary,
  deleteFolderFromCloudinary,
  deleteUserFiles,
  deleteJobFiles,
  deleteBlogFiles,
  extractPublicIdFromUrl,
  deleteFile
}; 