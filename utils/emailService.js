const nodemailer = require('nodemailer');

// Email transporter konfigürasyonu
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'mail.esantiyem.com', // cPanel SMTP
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || 'bilgi@esantiyem.com',
      pass: process.env.EMAIL_PASS || 'Uzman.4444'
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// 4 haneli OTP oluştur
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Şifre sıfırlama emaili gönder
const sendPasswordResetEmail = async (email, otp) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: '"e-Şantiyem Destek" <destek@esantiyem.com>',
    to: email,
    subject: 'Şifre Sıfırlama Kodu - e-Şantiyem',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007bff; margin: 0;">e-Şantiyem</h1>
            <p style="color: #6c757d; margin: 5px 0;">Güvenilir İş ve Hizmet Platformu</p>
          </div>
          
          <h2 style="color: #495057; margin-bottom: 20px;">Şifre Sıfırlama Talebi</h2>
          
          <p style="color: #495057; line-height: 1.6; margin-bottom: 20px;">
            Merhaba,<br><br>
            Hesabınız için şifre sıfırlama talebi aldık. Aşağıdaki 4 haneli kodu kullanarak yeni şifrenizi belirleyebilirsiniz:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #007bff; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 8px; display: inline-block;">
              ${otp}
            </div>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              ⚠️ <strong>Güvenlik Uyarısı:</strong><br>
              • Bu kod 5 dakika süreyle geçerlidir<br>
              • Kodu kimseyle paylaşmayınız<br>
              • Bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 12px; text-align: center; margin: 0;">
            Bu email otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.<br>
            © 2025 e-Şantiyem. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email gönderme hatası:', error);
    return { success: false, error: error.message };
  }
};

// Teklif bildirimi emaili gönder
const sendProposalNotification = async (customerEmail, jobTitle, providerName, proposalAmount) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: '"e-Şantiyem Bildirim" <bilgi@esantiyem.com>',
    to: customerEmail,
    subject: `Yeni Teklif Aldınız - ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007bff; margin: 0;">e-Şantiyem</h1>
            <p style="color: #6c757d; margin: 5px 0;">Güvenilir İş ve Hizmet Platformu</p>
          </div>
          
          <h2 style="color: #28a745; margin-bottom: 20px;">🎉 Yeni Teklif Aldınız!</h2>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>İş İlanı:</strong> ${jobTitle}</p>
            <p style="margin: 10px 0;"><strong>Hizmet Veren:</strong> ${providerName}</p>
            <p style="margin: 10px 0;"><strong>Teklif Tutarı:</strong> <span style="color: #28a745; font-size: 18px; font-weight: bold;">${proposalAmount} ₺</span></p>
          </div>
          
          <p style="color: #495057; line-height: 1.6; margin-bottom: 20px;">
            İlanınız için yeni bir teklif aldınız! Teklifi incelemek ve değerlendirmek için platforma giriş yapabilirsiniz.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://esantiyem.com/my-jobs" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Teklifleri İncele
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 12px; text-align: center; margin: 0;">
            Bu email otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.<br>
            © 2025 e-Şantiyem. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email gönderme hatası:', error);
    return { success: false, error: error.message };
  }
};

// Teklif kabul bildirimi emaili gönder
const sendProposalAcceptedNotification = async (providerEmail, jobTitle, customerName, acceptedAmount) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: '"e-Şantiyem Bildirim" <bilgi@esantiyem.com>',
    to: providerEmail,
    subject: `Teklifiniz Kabul Edildi! - ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007bff; margin: 0;">e-Şantiyem</h1>
            <p style="color: #6c757d; margin: 5px 0;">Güvenilir İş ve Hizmet Platformu</p>
          </div>
          
          <h2 style="color: #28a745; margin-bottom: 20px;">🎉 Tebrikler! Teklifiniz Kabul Edildi!</h2>
          
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>İş İlanı:</strong> ${jobTitle}</p>
            <p style="margin: 10px 0;"><strong>Müşteri:</strong> ${customerName}</p>
            <p style="margin: 10px 0;"><strong>Kabul Edilen Tutar:</strong> <span style="color: #28a745; font-size: 18px; font-weight: bold;">${acceptedAmount} ₺</span></p>
          </div>
          
          <p style="color: #495057; line-height: 1.6; margin-bottom: 20px;">
            Teklifiniz müşteri tarafından kabul edildi! Artık işe başlayabilir ve müşteriyle iletişime geçebilirsiniz.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://esantiyem.com/my-proposals" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              İşimi Görüntüle
            </a>
          </div>
          
          <div style="background-color: #cce7ff; border: 1px solid #b3d7ff; border-radius: 5px; padding: 15px; margin: 20px 0;">
            <p style="color: #004085; margin: 0; font-size: 14px;">
              💡 <strong>Hatırlatma:</strong><br>
              • Müşteriyle iletişimde kalın<br>
              • İşi zamanında tamamlayın<br>
              • Kaliteli hizmet vererek puanınızı yükseltin
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 12px; text-align: center; margin: 0;">
            Bu email otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.<br>
            © 2025 e-Şantiyem. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email gönderme hatası:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendPasswordResetEmail,
  sendProposalNotification,
  sendProposalAcceptedNotification
}; 