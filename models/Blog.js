const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Blog başlığı gerekli'],
    trim: true,
    maxlength: [200, 'Başlık 200 karakterden uzun olamaz']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  excerpt: {
    type: String,
    required: [true, 'Blog özeti gerekli'],
    trim: true,
    maxlength: [500, 'Özet 500 karakterden uzun olamaz']
  },
  content: {
    type: String,
    required: [true, 'Blog içeriği gerekli']
  },
  coverImage: {
    type: String,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  metaTitle: {
    type: String,
    trim: true,
    maxlength: [60, 'Meta başlık 60 karakterden uzun olamaz']
  },
  metaDescription: {
    type: String,
    trim: true,
    maxlength: [160, 'Meta açıklama 160 karakterden uzun olamaz']
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Slug'dan önce benzersizlik kontrolü
blogSchema.pre('save', async function(next) {
  if (this.isModified('slug')) {
    const existingBlog = await this.constructor.findOne({ 
      slug: this.slug, 
      _id: { $ne: this._id } 
    });
    
    if (existingBlog) {
      const error = new Error('Bu slug zaten kullanılıyor');
      return next(error);
    }
  }
  
  // Yayınlanma tarihi ayarla
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Meta bilgileri otomatik oluştur
blogSchema.pre('save', function(next) {
  if (!this.metaTitle) {
    this.metaTitle = this.title.substring(0, 60);
  }
  
  if (!this.metaDescription) {
    this.metaDescription = this.excerpt.substring(0, 160);
  }
  
  next();
});

// İndeksler
blogSchema.index({ slug: 1, status: 1 });
blogSchema.index({ tags: 1, status: 1 });
blogSchema.index({ createdAt: -1 });
blogSchema.index({ publishedAt: -1 });
blogSchema.index({ title: 'text', excerpt: 'text', content: 'text' });

module.exports = mongoose.model('Blog', blogSchema);

