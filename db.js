const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Collections to maintain
const COLLECTIONS = ['articles', 'categories', 'tags', 'authors', 'redirects', 'media', 'settings', 'comments', 'subscribers'];
const db = {};

// Load data into memory cache
COLLECTIONS.forEach(col => {
  const filePath = path.join(DATA_DIR, `${col}.json`);
  if (!fs.existsSync(filePath)) {
    // Initialize empty file
    fs.writeFileSync(filePath, JSON.stringify(col === 'settings' ? {} : [], null, 2), 'utf8');
    db[col] = col === 'settings' ? {} : [];
  } else {
    try {
      db[col] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`Error loading database file ${filePath}:`, e);
      db[col] = col === 'settings' ? {} : [];
    }
  }
});

// Helper for atomic writing
function saveCollection(col) {
  const filePath = path.join(DATA_DIR, `${col}.json`);
  const tempPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(db[col], null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    console.error(`Error saving database collection ${col}:`, e);
  }
}

// Database helper functions
const dbHelper = {
  // GET ALL
  getCollection(col) {
    return db[col] || [];
  },

  // FIND
  find(col, queryFn) {
    const data = db[col];
    if (!Array.isArray(data)) return [];
    return data.filter(queryFn);
  },

  // FIND ONE
  findOne(col, queryFn) {
    const data = db[col];
    if (col === 'settings') return data;
    if (!Array.isArray(data)) return null;
    return data.find(queryFn) || null;
  },

  // INSERT
  insert(col, doc) {
    if (col === 'settings') {
      db[col] = { ...db[col], ...doc };
      saveCollection(col);
      return db[col];
    }
    if (!Array.isArray(db[col])) db[col] = [];
    
    // Auto increment id if missing
    if (!doc.id) {
      const prefix = col.substring(0, 3);
      doc.id = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    
    db[col].push(doc);
    saveCollection(col);
    return doc;
  },

  // UPDATE
  update(col, queryFn, updateData) {
    if (col === 'settings') {
      db[col] = { ...db[col], ...updateData };
      saveCollection(col);
      return db[col];
    }
    const data = db[col];
    if (!Array.isArray(data)) return 0;
    
    let count = 0;
    db[col] = data.map(item => {
      if (queryFn(item)) {
        count++;
        // Merge item with updateData, preserving ID
        return { ...item, ...updateData, id: item.id };
      }
      return item;
    });
    
    if (count > 0) {
      saveCollection(col);
    }
    return count;
  },

  // DELETE
  delete(col, queryFn) {
    const data = db[col];
    if (!Array.isArray(data)) return 0;
    
    const initialLen = data.length;
    db[col] = data.filter(item => !queryFn(item));
    const deletedCount = initialLen - db[col].length;
    
    if (deletedCount > 0) {
      saveCollection(col);
    }
    return deletedCount;
  },

  // SAVE DIRECTLY (if array was manipulated out of bounds)
  forceSave(col) {
    saveCollection(col);
  }
};

// Seed default data if empty
function seed() {
  // Seed settings if empty or missing links/logos
  let settings = dbHelper.findOne('settings');
  if (!settings || Object.keys(settings).length === 0) {
    dbHelper.insert('settings', {
      google_analytics_id: '',
      google_tag_manager_id: '',
      default_cta: {
        title: 'Looking for a product from China?',
        subtitle: 'Submit your requirements and explore sourcing opportunities with Importerr.',
        buttonText: 'Submit Your Requirement',
        buttonUrl: '#consultationFlow'
      },
      header_links: [
        { label: 'Blog Home', url: '/blog' },
        { label: 'China Sourcing', url: '/blog/category/china-sourcing' },
        { label: 'Importing Guides', url: '/blog/category/importing-guides' },
        { label: 'E-commerce Brands', url: '/blog/category/ecommerce-brands' }
      ],
      footer_links: [
        { label: 'Home', url: '/blog' },
        { label: 'Main Website', url: 'https://www.importerr.com/' },
        { label: 'Sourcing Consultation', url: 'https://www.importerr.com/#consultationFlow' },
        { label: 'Privacy Policy', url: 'https://www.importerr.com/privacy' }
      ],
      header_logo_url: 'https://www.importerr.com/static/media/comimport.3838f084f6791c3ea895.png',
      footer_logo_url: 'https://www.importerr.com/static/media/comimport.3838f084f6791c3ea895.png'
    });
  } else {
    // If settings exists but links/logos are missing, update them
    let needsUpdate = false;
    if (!settings.header_links) {
      settings.header_links = [
        { label: 'Blog Home', url: '/blog' },
        { label: 'China Sourcing', url: '/blog/category/china-sourcing' },
        { label: 'Importing Guides', url: '/blog/category/importing-guides' },
        { label: 'E-commerce Brands', url: '/blog/category/ecommerce-brands' }
      ];
      needsUpdate = true;
    }
    if (!settings.footer_links) {
      settings.footer_links = [
        { label: 'Home', url: '/blog' },
        { label: 'Main Website', url: 'https://www.importerr.com/' },
        { label: 'Sourcing Consultation', url: 'https://www.importerr.com/#consultationFlow' },
        { label: 'Privacy Policy', url: 'https://www.importerr.com/privacy' }
      ];
      needsUpdate = true;
    }
    if (!settings.hasOwnProperty('header_logo_url')) {
      settings.header_logo_url = 'https://www.importerr.com/static/media/comimport.3838f084f6791c3ea895.png';
      needsUpdate = true;
    }
    if (!settings.hasOwnProperty('footer_logo_url')) {
      settings.footer_logo_url = 'https://www.importerr.com/static/media/comimport.3838f084f6791c3ea895.png';
      needsUpdate = true;
    }
    if (needsUpdate) {
      dbHelper.update('settings', () => true, settings);
    }
  }

  // Seed Categories if empty
  const categories = dbHelper.getCollection('categories');
  if (categories.length === 0) {
    const defaults = [
      { id: 'cat_1', name: 'China Sourcing', slug: 'china-sourcing', description: 'Guides and updates for sourcing products from China factories.', status: 'active', seoTitle: 'China Sourcing Guide | Importerr Blog', metaDescription: 'Learn how to find and source products from China manufacturers.' },
      { id: 'cat_2', name: 'Importing Guides', slug: 'importing-guides', description: 'Detailed walkthroughs on custom clearances, tariffs, and importing laws.', status: 'active', seoTitle: 'How to Import from China | Importerr Blog', metaDescription: 'Everything about import custom clearance, logistics, and legal compliance.' },
      { id: 'cat_3', name: 'Shipping & Logistics', slug: 'shipping-logistics', description: 'Ocean freight, air shipping, and courier updates.', status: 'active', seoTitle: 'Shipping & Logistics Guides | Importerr Blog', metaDescription: 'Tips on shipping products from Chinese ports to Indian warehouses.' },
      { id: 'cat_4', name: 'E-commerce & Brands', slug: 'ecommerce-brands', description: 'Amazon FBA, Meesho, and Shopify D2C business tactics.', status: 'active', seoTitle: 'E-commerce Sourcing Strategies | Importerr Blog', metaDescription: 'Build your D2C brand or Amazon retail shop with high-margin custom sourcing.' },
      { id: 'cat_5', name: 'Importerr Updates', slug: 'importerr-updates', description: 'Updates about our service expansions, terms, and office news.', status: 'active', seoTitle: 'Importerr Service Updates & News', metaDescription: 'Official announcements and updates from the Importerr sourcing team.' }
    ];
    defaults.forEach(c => dbHelper.insert('categories', c));
  }

  // Seed Tag examples if empty
  const tags = dbHelper.getCollection('tags');
  if (tags.length === 0) {
    const defaults = [
      { id: 'tag_1', name: 'Alibaba', slug: 'alibaba', description: 'Tips on sourcing through Alibaba safely.', status: 'active' },
      { id: 'tag_2', name: 'Verify Supplier', slug: 'verify-supplier', description: 'Verify factory licensing and credentials.', status: 'active' },
      { id: 'tag_3', name: 'MOQ Guide', slug: 'moq-guide', description: 'Minimum Order Quantities negotiations.', status: 'active' },
      { id: 'tag_4', name: 'Customs Duties', slug: 'customs-duties', description: 'Calculating custom duties for Indian ports.', status: 'active' }
    ];
    defaults.forEach(t => dbHelper.insert('tags', t));
  }

  // Seed Default Author if empty
  const authors = dbHelper.getCollection('authors');
  if (authors.length === 0) {
    dbHelper.insert('authors', {
      id: 'auth_1',
      name: 'Vipin Kumar',
      slug: 'vipin-kumar',
      designation: 'Founder & China Sourcing Expert',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
      bio: 'Vipin is the founder of Importerr. He has 15+ years of hands-on experience helping Indian e-commerce brands, Amazon sellers, and corporate importers verify Chinese suppliers and streamline sea and air shipping door-to-door.',
      social: {
        linkedin: 'https://linkedin.com/in/vipin-kumar-importerr',
        twitter: 'https://twitter.com/vipin_importerr'
      }
    });
  }
}

seed();

module.exports = dbHelper;
