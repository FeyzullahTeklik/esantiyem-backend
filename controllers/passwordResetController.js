const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateOTP, sendPasswordResetEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');

// Şifre sıfırlama kodu gönder
const sendResetCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email adresi gerekli'
      });
    }

    // Kullanıcı var mı kontrol et
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Bu email adresi ile kayıtlı kullanıcı bulunamadı'
      });
    }

    // Önceki OTP'leri temizle
    await OTP.deleteMany({ 
      email: email.toLowerCase(), 
      type: 'password_reset' 
    });

    // Yeni OTP oluştur
    const otp = generateOTP();
    
    const otpRecord = new OTP({
      email: email.toLowerCase(),
      otp,
      type: 'password_reset'
    });

    await otpRecord.save();

    // Email gönder
    const emailResult = await sendPasswordResetEmail(email, otp);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Email gönderilemedi. Lütfen daha sonra tekrar deneyiniz.'
      });
    }

    res.json({
      success: true,
      message: 'Şifre sıfırlama kodu email adresinize gönderildi'
    });

  } catch (error) {
    console.error('Send reset code error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// OTP doğrula
const verifyResetCode = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email ve doğrulama kodu gerekli'
      });
    }

    // OTP'yi bul
    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      type: 'password_reset',
      isUsed: false
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz veya süresi dolmuş kod'
      });
    }

    // Deneme sayısını kontrol et
    if (otpRecord.attempts >= 5) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'Çok fazla hatalı deneme. Yeni kod talep ediniz.'
      });
    }

    // OTP doğru mu kontrol et
    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      
      return res.status(400).json({
        success: false,
        message: `Hatalı kod. Kalan deneme: ${5 - otpRecord.attempts}`
      });
    }

    // OTP'yi kullanıldı olarak işaretle
    otpRecord.isUsed = true;
    await otpRecord.save();

    res.json({
      success: true,
      message: 'Kod doğrulandı',
      resetToken: otpRecord._id // Şifre değiştirme için geçici token
    });

  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

// Yeni şifre belirleme
const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token ve yeni şifre gerekli'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Şifre en az 6 karakter olmalıdır'
      });
    }

    // OTP kaydını bul ve kontrol et
    const otpRecord = await OTP.findById(resetToken);
    if (!otpRecord || !otpRecord.isUsed || otpRecord.type !== 'password_reset') {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz reset token'
      });
    }

    // Kullanıcıyı bul
    const user = await User.findOne({ email: otpRecord.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Şifreyi güncelle (User model'deki pre-save middleware otomatik hash'leyecek)
    user.password = newPassword;
    await user.save();

    // OTP kaydını sil
    await OTP.deleteOne({ _id: resetToken });

    res.json({
      success: true,
      message: 'Şifreniz başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

module.exports = {
  sendResetCode,
  verifyResetCode,
  resetPassword
}; 