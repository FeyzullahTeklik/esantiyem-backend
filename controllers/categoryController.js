const Category = require('../models/Category');

// Tüm kategorileri getir
const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .sort({ order: 1, name: 1 });

    res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler yüklenirken hata oluştu'
    });
  }
};

// Aktif kategorileri getir (frontend için)
const getActiveCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, name: 1 });

    // Sadece aktif subcategoryleri filtrele
    const filteredCategories = categories.map(cat => ({
      ...cat.toObject(),
      subcategories: cat.subcategories.filter(sub => sub.isActive)
    }));

    res.json({
      success: true,
      categories: filteredCategories
    });

  } catch (error) {
    console.error('Get active categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler yüklenirken hata oluştu'
    });
  }
};

// Kategori oluştur
const createCategory = async (req, res) => {
  try {
    const { name, description, icon, order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Kategori adı gerekli'
      });
    }

    // Aynı isimde kategori var mı kontrol et
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Bu isimde bir kategori zaten mevcut'
      });
    }

    const category = new Category({
      name,
      description,
      icon,
      order: order || 0
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Kategori başarıyla oluşturuldu',
      category
    });

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori oluşturulurken hata oluştu'
    });
  }
};

// Kategori güncelle
const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, icon, order, isActive } = req.body;

    const category = await Category.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    // Aynı isimde başka kategori var mı kontrol et
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Bu isimde bir kategori zaten mevcut'
        });
      }
    }

    // Güncellenebilir alanları güncelle
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (icon !== undefined) category.icon = icon;
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.json({
      success: true,
      message: 'Kategori başarıyla güncellendi',
      category
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori güncellenirken hata oluştu'
    });
  }
};

// Kategori sil
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const category = await Category.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    await Category.findByIdAndDelete(categoryId);

    res.json({
      success: true,
      message: 'Kategori başarıyla silindi'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori silinirken hata oluştu'
    });
  }
};

// Alt kategori ekleme
const addSubcategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Alt kategori adı gerekli'
      });
    }

    const category = await Category.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    // Aynı isimde alt kategori var mı kontrol et
    const existingSubcategory = category.subcategories.find(sub => sub.name === name);
    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: 'Bu isimde bir alt kategori zaten mevcut'
      });
    }

    await category.addSubcategory({ name, description });

    res.status(201).json({
      success: true,
      message: 'Alt kategori başarıyla eklendi',
      category
    });

  } catch (error) {
    console.error('Add subcategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Alt kategori eklenirken hata oluştu'
    });
  }
};

// Alt kategori güncelle
const updateSubcategory = async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.params;
    const { name, description, isActive } = req.body;

    const category = await Category.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    const subcategory = category.subcategories.id(subcategoryId);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Alt kategori bulunamadı'
      });
    }

    // Aynı isimde başka alt kategori var mı kontrol et
    if (name && name !== subcategory.name) {
      const existingSubcategory = category.subcategories.find(sub => 
        sub.name === name && sub._id.toString() !== subcategoryId
      );
      if (existingSubcategory) {
        return res.status(400).json({
          success: false,
          message: 'Bu isimde bir alt kategori zaten mevcut'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    await category.updateSubcategory(subcategoryId, updateData);

    res.json({
      success: true,
      message: 'Alt kategori başarıyla güncellendi',
      category
    });

  } catch (error) {
    console.error('Update subcategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Alt kategori güncellenirken hata oluştu'
    });
  }
};

// Alt kategori sil
const deleteSubcategory = async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.params;

    const category = await Category.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    const subcategory = category.subcategories.id(subcategoryId);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Alt kategori bulunamadı'
      });
    }

    await category.removeSubcategory(subcategoryId);

    res.json({
      success: true,
      message: 'Alt kategori başarıyla silindi',
      category
    });

  } catch (error) {
    console.error('Delete subcategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Alt kategori silinirken hata oluştu'
    });
  }
};

module.exports = {
  getAllCategories,
  getActiveCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory
}; 