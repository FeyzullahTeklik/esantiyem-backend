const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'esantiyem-secret-key';

// Token oluşturma
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

// Token doğrulama middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Erişim token\'ı gerekli' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Geçersiz token' 
      });
    }

    req.user = user;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Geçersiz token' 
    });
  }
};

// Opsiyonel token doğrulama middleware (token varsa doğrular, yoksa da devam eder)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      // Token yoksa devam et
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (user) {
      req.user = user;
      req.userId = decoded.userId;
    }

    next();
  } catch (error) {
    // Token geçersizse devam et (error atmaz)
    next();
  }
};

// Admin yetkisi kontrolü
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin yetkisi gerekli' 
    });
  }
  next();
};

// Provider yetkisi kontrolü
const requireProvider = (req, res, next) => {
  if (req.user.role !== 'provider') {
    return res.status(403).json({ 
      success: false, 
      message: 'Hizmet veren yetkisi gerekli' 
    });
  }
  next();
};

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireProvider
}; 