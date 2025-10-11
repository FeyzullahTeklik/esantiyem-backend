const Blog = require('../models/Blog');
const User = require('../models/User');

// Tüm blogları listele (public - published only)
const getAllBlogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      tag = '',
      sortBy = 'newest'
    } = req.query;

    const query = { status: 'published' };

    // Arama
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Tag filtresi
    if (tag) {
      query.tags = tag.toLowerCase();
    }

    // Sıralama
    let sort = {};
    switch (sortBy) {
      case 'oldest':
        sort = { publishedAt: 1 };
        break;
      case 'popular':
        sort = { views: -1 };
        break;
      case 'newest':
      default:
        sort = { publishedAt: -1 };
    }

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name profileImage')
      .select('-content') // İçeriği listede gösterme
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      blogs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });

  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Bloglar yüklenirken hata oluştu'
    });
  }
};

// Slug ile blog detay (public)
const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('author', 'name profileImage about')
      .lean();

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog bulunamadı'
      });
    }

    // Görüntülenme sayısını artır
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

    res.json({
      success: true,
      blog
    });

  } catch (error) {
    console.error('Get blog by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Blog yüklenirken hata oluştu'
    });
  }
};

// Admin: Tüm bloglar (tüm statuslar)
const getAllBlogsForAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = '',
      search = ''
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    // İstatistikler
    const stats = {
      total: await Blog.countDocuments(),
      published: await Blog.countDocuments({ status: 'published' }),
      draft: await Blog.countDocuments({ status: 'draft' }),
      archived: await Blog.countDocuments({ status: 'archived' }),
      totalViews: await Blog.aggregate([
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]).then(result => result[0]?.total || 0)
    };

    res.json({
      success: true,
      blogs,
      stats,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });

  } catch (error) {
    console.error('Get all blogs for admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Bloglar yüklenirken hata oluştu'
    });
  }
};

// Admin: Blog oluştur
const createBlog = async (req, res) => {
  try {
    const { 
      title, 
      slug, 
      excerpt, 
      content, 
      tags, 
      coverImage,
      metaTitle,
      metaDescription,
      status = 'draft'
    } = req.body;

    // Validasyon
    if (!title || !slug || !excerpt || !content) {
      return res.status(400).json({
        success: false,
        message: 'Başlık, slug, özet ve içerik gerekli'
      });
    }

    // Slug benzersizlik kontrolü
    const existingBlog = await Blog.findOne({ slug: slug.toLowerCase().trim() });
    if (existingBlog) {
      return res.status(400).json({
        success: false,
        message: 'Bu slug zaten kullanılıyor'
      });
    }

    const blog = new Blog({
      title: title.trim(),
      slug: slug.toLowerCase().trim(),
      excerpt: excerpt.trim(),
      content,
      tags: tags || [],
      coverImage: coverImage || null,
      metaTitle,
      metaDescription,
      author: req.userId,
      status,
      publishedAt: status === 'published' ? new Date() : null
    });

    await blog.save();

    const populatedBlog = await Blog.findById(blog._id)
      .populate('author', 'name email profileImage');

    res.status(201).json({
      success: true,
      message: 'Blog başarıyla oluşturuldu',
      blog: populatedBlog
    });

  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Blog oluşturulurken hata oluştu'
    });
  }
};

// Admin: Blog güncelle
const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      slug, 
      excerpt, 
      content, 
      tags, 
      coverImage,
      metaTitle,
      metaDescription,
      status
    } = req.body;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog bulunamadı'
      });
    }

    // Slug değişiyorsa benzersizlik kontrolü
    if (slug && slug !== blog.slug) {
      const existingBlog = await Blog.findOne({ 
        slug: slug.toLowerCase().trim(),
        _id: { $ne: id }
      });
      
      if (existingBlog) {
        return res.status(400).json({
          success: false,
          message: 'Bu slug zaten kullanılıyor'
        });
      }
      blog.slug = slug.toLowerCase().trim();
    }

    // Güncelleme
    if (title) blog.title = title.trim();
    if (excerpt) blog.excerpt = excerpt.trim();
    if (content !== undefined) blog.content = content;
    if (tags !== undefined) blog.tags = tags;
    if (coverImage !== undefined) blog.coverImage = coverImage;
    if (metaTitle !== undefined) blog.metaTitle = metaTitle;
    if (metaDescription !== undefined) blog.metaDescription = metaDescription;
    
    // Status değişimi
    if (status && status !== blog.status) {
      blog.status = status;
      if (status === 'published' && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
    }

    await blog.save();

    const updatedBlog = await Blog.findById(blog._id)
      .populate('author', 'name email profileImage');

    res.json({
      success: true,
      message: 'Blog başarıyla güncellendi',
      blog: updatedBlog
    });

  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Blog güncellenirken hata oluştu'
    });
  }
};

// Admin: Blog sil
const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog bulunamadı'
      });
    }

    // Blog klasöründeki tüm görselleri sil (Cloudinary)
    try {
      const { deleteBlogFiles } = require('./uploadController');
      const deleteResult = await deleteBlogFiles(id);
      console.log(`Blog ${id} files deletion result:`, deleteResult);
    } catch (error) {
      console.error('Blog files deletion error:', error);
    }

    await Blog.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Blog ve görselleri başarıyla silindi'
    });

  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Blog silinirken hata oluştu'
    });
  }
};

// Popüler bloglar
const getPopularBlogs = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const blogs = await Blog.find({ status: 'published' })
      .populate('author', 'name profileImage')
      .select('title slug excerpt coverImage views publishedAt')
      .sort({ views: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      blogs
    });

  } catch (error) {
    console.error('Get popular blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Popüler bloglar yüklenirken hata oluştu'
    });
  }
};

// Tüm etiketleri getir
const getAllTags = async (req, res) => {
  try {
    const tags = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    res.json({
      success: true,
      tags: tags.map(t => ({ name: t._id, count: t.count }))
    });

  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      message: 'Etiketler yüklenirken hata oluştu'
    });
  }
};

// İlgili bloglar
const getRelatedBlogs = async (req, res) => {
  try {
    const { slug } = req.params;
    const { limit = 3 } = req.query;

    const currentBlog = await Blog.findOne({ slug, status: 'published' });

    if (!currentBlog) {
      return res.status(404).json({
        success: false,
        message: 'Blog bulunamadı'
      });
    }

    // Aynı etiketlere sahip bloglar
    const relatedBlogs = await Blog.find({
      status: 'published',
      _id: { $ne: currentBlog._id },
      tags: { $in: currentBlog.tags }
    })
      .populate('author', 'name profileImage')
      .select('title slug excerpt coverImage publishedAt')
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      blogs: relatedBlogs
    });

  } catch (error) {
    console.error('Get related blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'İlgili bloglar yüklenirken hata oluştu'
    });
  }
};

module.exports = {
  getAllBlogs,
  getBlogBySlug,
  getAllBlogsForAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  getPopularBlogs,
  getAllTags,
  getRelatedBlogs
};

