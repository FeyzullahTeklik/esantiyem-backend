const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { 
  uploadProfile, 
  uploadJobFiles, 
  uploadProfileImage, 
  uploadJobAttachments,
  uploadFile,
  deleteFromCloudinary,
  extractPublicIdFromUrl
} = require('../controllers/uploadController');

// Profil fotoğrafı yükleme
router.post('/profile-image', authenticateToken, uploadProfile.single('profileImage'), uploadProfileImage);

// İş ilanı dosya yükleme
router.post('/job-attachments', optionalAuth, uploadJobFiles.array('files', 10), uploadJobAttachments);

// Genel dosya yükleme
router.post('/file', authenticateToken, uploadProfile.single('file'), uploadFile);

// Cloudinary dosya silme (profil fotoğrafı için)
router.delete('/cloudinary-file', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL gerekli' 
      });
    }

    const publicId = extractPublicIdFromUrl(url);
    if (!publicId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Geçersiz Cloudinary URL' 
      });
    }

    const result = await deleteFromCloudinary(publicId);
    
    res.json({
      success: result.success,
      message: result.success ? 'Dosya başarıyla silindi' : 'Dosya silinemedi',
      result: result.result
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Dosya silinirken hata oluştu' 
    });
  }
});

module.exports = router; 