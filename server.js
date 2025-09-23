require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const categoryRoutes = require('./routes/category');
const uploadRoutes = require('./routes/upload');
const jobRoutes = require('./routes/job');
const reviewRoutes = require('./routes/review');
const supportRoutes = require('./routes/support');
const passwordResetRoutes = require('./routes/passwordReset');
const serviceRoutes = require('./routes/service');
const proposalRoutes = require('./routes/proposal');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/proposals', proposalRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

const mongoUri = process.env.MONGODB_URI || '';

// Admin hesabı oluşturma fonksiyonu
async function createDefaultAdmin() {
  try {
    const User = require('./models/User');
    
    // Sistem admin hesabını kontrol et
    const existingAdmin = await User.findOne({ email: 'system@gmail.com' });
    
    if (!existingAdmin) {
      const adminUser = new User({
        name: 'Sistem Yöneticisi',
        email: 'system@gmail.com',
        password: '123456789',
        role: 'admin',
        isEmailVerified: true,
        kvkkConsent: {
          accepted: true,
          acceptedAt: new Date(),
          ip: '127.0.0.1'
        }
      });
      
      await adminUser.save();
      console.log('✅ Default admin user created: system@gmail.com / 123456789');
    } else {
      console.log('ℹ️  Default admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error creating default admin user:', error);
  }
}



async function start() {
  try {
    if (mongoUri) {
      await mongoose.connect(mongoUri);
      console.log('Connected to MongoDB');
      
      // Admin hesabını oluştur
      await createDefaultAdmin();
    } else {
      console.log('MONGODB_URI not set, starting without DB connection');
    }

    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start(); 