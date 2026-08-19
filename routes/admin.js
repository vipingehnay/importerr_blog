const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

// Helper to extract unique months from a collection for date filtering (WordPress style)
function getUniqueMonths(collection, dateField) {
  const monthsMap = {};
  collection.forEach(item => {
    const rawVal = item[dateField];
    if (!rawVal) return;
    const d = new Date(rawVal);
    if (isNaN(d.getTime())) return;
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${yyyy}-${mm}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    monthsMap[value] = label;
  });

  return Object.keys(monthsMap)
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ value: key, label: monthsMap[key] }));
}

// Try loading sharp for image compression, set boolean flag
let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('Sharp image compression library not loaded. Falling back to raw file serving.');
}

// Multer upload configurations
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads directory (might be read-only):', e);
}

// Use memoryStorage to prevent lambda disk write failure crashes
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB file
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|avif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG, JPG, PNG, WEBP, AVIF) are allowed.'));
  }
});

// Middleware: Require Admin Authentication
function requireAuth(req, res, next) {
  const cookie = req.headers.cookie || '';
  const isLoggedIn = (req.session && req.session.isLoggedIn) || cookie.includes('admin_logged_in=true');
  if (isLoggedIn) {
    return next();
  }
  res.redirect('/blog/admin/login');
}

// Helper: Populate names for relations
function populateRelations(art) {
  const category = db.findOne('categories', c => c.slug === art.category);
  const author = db.findOne('authors', a => a.slug === art.author);
  return {
    ...art,
    categoryName: category ? category.name : 'Uncategorized',
    authorName: author ? author.name : 'Unknown Author'
  };
}

// ==========================================================================
// AUTHENTICATION ROUTES
// ==========================================================================

router.get('/login', (req, res) => {
  const cookie = req.headers.cookie || '';
  const isLoggedIn = (req.session && req.session.isLoggedIn) || cookie.includes('admin_logged_in=true');
  if (isLoggedIn) {
    return res.redirect('/blog/admin/dashboard');
  }
  res.render('admin/login');
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === 'importerr@2026') {
    req.session.isLoggedIn = true;
    res.cookie('admin_logged_in', 'true', { path: '/' });
    return res.redirect('/blog/admin/dashboard');
  }
  res.render('admin/login', { error: 'Incorrect credentials. Please try again.' });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.clearCookie('admin_logged_in', { path: '/' });
  res.redirect('/blog/admin/login');
});

// Apply requireAuth middleware to all subsequent admin routes
router.use(requireAuth);

router.get('/', (req, res) => {
  res.redirect('/blog/admin/dashboard');
});

// ==========================================================================
// DASHBOARD & STATS OVERVIEW
// ==========================================================================

router.get('/dashboard', (req, res) => {
  const articles = db.getCollection('articles');
  
  const stats = {
    total: articles.length,
    published: articles.filter(a => a.status === 'published').length,
    drafts: articles.filter(a => a.status === 'draft').length,
    scheduled: articles.filter(a => a.status === 'scheduled').length,
    categories: db.getCollection('categories').length
  };

  const recent = [...articles]
    .sort((a, b) => new Date(b.updatedAt || b.publishedAt) - new Date(a.updatedAt || a.publishedAt))
    .slice(0, 5)
    .map(populateRelations);

  res.render('admin/dashboard', {
    activeNav: 'dashboard',
    stats,
    recentArticles: recent
  });
});

// ==========================================================================
// ARTICLES MANAGEMENT (CRUD)
// ==========================================================================

router.get('/articles', (req, res) => {
  const statusFilter = req.query.status;
  const searchVal = req.query.search;
  const dateFilter = req.query.date || '';
  
  const allArticles = db.getCollection('articles');
  const availableMonths = getUniqueMonths(allArticles, 'publishedAt');
  
  let articles = [...allArticles];
  
  if (statusFilter) {
    articles = articles.filter(a => a.status === statusFilter);
  }
  if (searchVal) {
    const q = searchVal.toLowerCase();
    articles = articles.filter(a => a.title.toLowerCase().includes(q));
  }
  if (dateFilter) {
    articles = articles.filter(a => {
      const d = new Date(a.publishedAt);
      if (isNaN(d.getTime())) return false;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}` === dateFilter;
    });
  }

  // Sort by date modified
  articles = articles
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(populateRelations);

  res.render('admin/articles', {
    activeNav: 'articles',
    articles,
    statusFilter,
    searchVal,
    availableMonths,
    dateFilter
  });
});

router.post('/articles/bulk', (req, res) => {
  const { action } = req.body;
  let ids = req.body.ids;
  if (!ids) return res.redirect('/blog/admin/articles');
  if (!Array.isArray(ids)) ids = [ids];

  if (action === 'publish') {
    ids.forEach(id => {
      db.update('articles', a => a.id === id, { status: 'published' });
    });
  } else if (action === 'draft') {
    ids.forEach(id => {
      db.update('articles', a => a.id === id, { status: 'draft' });
    });
  } else if (action === 'archive') {
    ids.forEach(id => {
      db.update('articles', a => a.id === id, { status: 'archived' });
    });
  } else if (action === 'delete') {
    ids.forEach(id => {
      db.delete('articles', a => a.id === id);
    });
  }

  res.redirect('/blog/admin/articles');
});

// Create article form
router.get('/articles/new', (req, res) => {
  const categories = db.find('categories', c => c.status === 'active');
  const authors = db.getCollection('authors');
  const tags = db.find('tags', t => t.status === 'active');

  res.render('admin/article-form', {
    activeNav: 'articles',
    article: null,
    categories,
    authors,
    tags
  });
});

// Save new article
router.post('/articles/create', (req, res) => {
  const {
    title, slug, excerpt, content, featuredImage, category, tags, author, status,
    isFeatured, pillarArticle, publishedAt, seo_title, seo_description, canonical_url,
    og_title, og_description, og_image, twitter_title, twitter_description, seo_index, seo_follow,
    key_takeaways, faq_q, faq_a
  } = req.body;

  // Compile Key Takeaways (One per line)
  const takeawaysList = (key_takeaways || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Compile FAQ array
  const faqList = [];
  if (faq_q && faq_a) {
    const questions = Array.isArray(faq_q) ? faq_q : [faq_q];
    const answers = Array.isArray(faq_a) ? faq_a : [faq_a];
    
    questions.forEach((q, idx) => {
      if (q.trim() && answers[idx] && answers[idx].trim()) {
        faqList.push({ q: q.trim(), a: answers[idx].trim() });
      }
    });
  }

  // Handle sluggification if slug is empty
  let finalSlug = (slug || '').trim();
  if (!finalSlug) {
    finalSlug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  }

  const now = new Date().toISOString();
  
  const article = {
    title: title.trim(),
    slug: finalSlug,
    excerpt: excerpt.trim(),
    content: content,
    featuredImage: featuredImage.trim() || 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&h=450&q=80', // Default fallback
    category: category,
    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
    author: author,
    status: status,
    isFeatured: isFeatured === 'true',
    pillarArticle: pillarArticle === 'true',
    publishedAt: status === 'scheduled' ? new Date(publishedAt).toISOString() : (status === 'published' ? now : null),
    updatedAt: now,
    keyTakeaways: takeawaysList,
    faq: faqList,
    seo: {
      title: (seo_title || '').trim(),
      description: (seo_description || '').trim() || excerpt.substring(0, 160).trim(),
      canonicalUrl: (canonical_url || '').trim(),
      ogTitle: (og_title || '').trim(),
      ogDescription: (og_description || '').trim(),
      ogImage: (og_image || '').trim(),
      twitterTitle: (twitter_title || '').trim(),
      twitterDescription: (twitter_description || '').trim(),
      index: seo_index === 'true',
      follow: seo_follow === 'true'
    }
  };

  db.insert('articles', article);
  res.redirect('/blog/admin/articles');
});

// Edit article form
router.get('/articles/edit/:id', (req, res) => {
  const article = db.findOne('articles', a => a.id === req.params.id);
  if (!article) return res.redirect('/blog/admin/articles');

  const categories = db.find('categories', c => c.status === 'active');
  const authors = db.getCollection('authors');
  const tags = db.find('tags', t => t.status === 'active');

  res.render('admin/article-form', {
    activeNav: 'articles',
    article,
    categories,
    authors,
    tags
  });
});

// Preview Draft article route
router.get('/articles/preview/:id', (req, res) => {
  const articleRaw = db.findOne('articles', a => a.id === req.params.id);
  if (!articleRaw) return res.status(404).send('Preview article not found.');

  const settings = db.findOne('settings') || {};
  const category = db.findOne('categories', c => c.slug === articleRaw.category);
  const author = db.findOne('authors', a => a.slug === articleRaw.author);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(articleRaw.publishedAt || Date.now());
  const formattedPublishDate = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  const article = {
    ...articleRaw,
    categoryName: category ? category.name : 'Uncategorized',
    authorName: author ? author.name : 'Author',
    authorPhoto: author ? author.photo : '',
    authorBio: author ? author.bio : '',
    authorSlug: author ? author.slug : '',
    authorSocial: author ? author.social : {},
    formattedPublishDate,
    formattedUpdateDate: formattedPublishDate,
    readingTime: '5 min read'
  };

  res.render('blog/post', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl: `${req.protocol}://${req.get('host')}/blog/${article.slug}`,
    isArticle: true,
    ...article,
    seo: { title: `PREVIEW: ${article.title}`, description: article.excerpt, canonicalUrl: '', index: false, follow: false },
    relatedArticles: [],
    recommendedArticles: [],
    cta: settings.default_cta || null,
    globalSettings: settings
  });
});

// Update article
router.post('/articles/update/:id', (req, res) => {
  const {
    title, slug, excerpt, content, featuredImage, category, tags, author, status,
    isFeatured, pillarArticle, publishedAt, seo_title, seo_description, canonical_url,
    og_title, og_description, og_image, twitter_title, twitter_description, seo_index, seo_follow,
    key_takeaways, faq_q, faq_a
  } = req.body;

  const article = db.findOne('articles', a => a.id === req.params.id);
  if (!article) return res.redirect('/blog/admin/articles');

  // Redirection Management: Generate 301 Redirect if Published article slug is updated
  let newSlug = (slug || '').trim();
  if (!newSlug) {
    newSlug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  }

  if (article.status === 'published' && article.slug !== newSlug) {
    // Generate Redirect rule
    db.insert('redirects', {
      fromPath: `/blog/${article.slug}`,
      toPath: `/blog/${newSlug}`,
      type: '301'
    });
  }

  // Compile Key Takeaways
  const takeawaysList = (key_takeaways || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Compile FAQs
  const faqList = [];
  if (faq_q && faq_a) {
    const questions = Array.isArray(faq_q) ? faq_q : [faq_q];
    const answers = Array.isArray(faq_a) ? faq_a : [faq_a];
    
    questions.forEach((q, idx) => {
      if (q.trim() && answers[idx] && answers[idx].trim()) {
        faqList.push({ q: q.trim(), a: answers[idx].trim() });
      }
    });
  }

  const now = new Date().toISOString();

  const updatedFields = {
    title: title.trim(),
    slug: newSlug,
    excerpt: excerpt.trim(),
    content: content,
    featuredImage: featuredImage.trim(),
    category: category,
    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
    author: author,
    status: status,
    isFeatured: isFeatured === 'true',
    pillarArticle: pillarArticle === 'true',
    publishedAt: status === 'scheduled' ? new Date(publishedAt).toISOString() : (article.publishedAt || now),
    updatedAt: now,
    keyTakeaways: takeawaysList,
    faq: faqList,
    seo: {
      title: (seo_title || '').trim(),
      description: (seo_description || '').trim(),
      canonicalUrl: (canonical_url || '').trim(),
      ogTitle: (og_title || '').trim(),
      ogDescription: (og_description || '').trim(),
      ogImage: (og_image || '').trim(),
      twitterTitle: (twitter_title || '').trim(),
      twitterDescription: (twitter_description || '').trim(),
      index: seo_index === 'true',
      follow: seo_follow === 'true'
    }
  };

  db.update('articles', a => a.id === req.params.id, updatedFields);
  res.redirect('/blog/admin/articles');
});

// Duplicate article
router.post('/articles/duplicate/:id', (req, res) => {
  const article = db.findOne('articles', a => a.id === req.params.id);
  if (!article) return res.redirect('/blog/admin/articles');

  const now = new Date().toISOString();
  const duplicate = {
    ...article,
    id: undefined, // Will be generated
    title: `Copy of ${article.title}`,
    slug: `${article.slug}-copy`,
    status: 'draft',
    publishedAt: null,
    updatedAt: now,
    isFeatured: false
  };

  db.insert('articles', duplicate);
  res.redirect('/blog/admin/articles');
});

// Delete/Archive article
router.post('/articles/delete/:id', (req, res) => {
  // Instead of destructive delete, we set status to archived/deleted
  db.update('articles', a => a.id === req.params.id, {
    status: 'archived',
    updatedAt: new Date().toISOString()
  });
  res.redirect('/blog/admin/articles');
});

// ==========================================================================
// CATEGORIES MANAGEMENT CRUD
// ==========================================================================

router.get('/categories', (req, res) => {
  const categories = db.getCollection('categories');
  res.render('admin/categories', {
    activeNav: 'categories',
    categories
  });
});

router.post('/categories/create', (req, res) => {
  const { name, slug, description, status, seoTitle, metaDescription } = req.body;
  
  db.insert('categories', {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    description: description.trim(),
    status: status,
    seoTitle: (seoTitle || '').trim(),
    metaDescription: (metaDescription || '').trim()
  });
  res.redirect('/blog/admin/categories');
});

router.post('/categories/update/:id', (req, res) => {
  const { name, slug, description, status, seoTitle, metaDescription } = req.body;
  
  db.update('categories', c => c.id === req.params.id, {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    description: description.trim(),
    status: status,
    seoTitle: (seoTitle || '').trim(),
    metaDescription: (metaDescription || '').trim()
  });
  res.redirect('/blog/admin/categories');
});

router.post('/categories/delete/:id', (req, res) => {
  db.delete('categories', c => c.id === req.params.id);
  res.redirect('/blog/admin/categories');
});

// ==========================================================================
// TAGS MANAGEMENT CRUD
// ==========================================================================

router.get('/tags', (req, res) => {
  const tags = db.getCollection('tags');
  res.render('admin/tags', {
    activeNav: 'tags',
    tags
  });
});

router.post('/tags/create', (req, res) => {
  const { name, slug, description, status } = req.body;
  db.insert('tags', {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    description: description.trim(),
    status: status
  });
  res.redirect('/blog/admin/tags');
});

router.post('/tags/update/:id', (req, res) => {
  const { name, slug, description, status } = req.body;
  db.update('tags', t => t.id === req.params.id, {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    description: description.trim(),
    status: status
  });
  res.redirect('/blog/admin/tags');
});

router.post('/tags/delete/:id', (req, res) => {
  db.delete('tags', t => t.id === req.params.id);
  res.redirect('/blog/admin/tags');
});

// ==========================================================================
// AUTHORS MANAGEMENT CRUD
// ==========================================================================

router.get('/authors', (req, res) => {
  const authors = db.getCollection('authors');
  res.render('admin/authors', {
    activeNav: 'authors',
    authors
  });
});

router.post('/authors/create', (req, res) => {
  const { name, slug, designation, photo, bio, linkedin, twitter } = req.body;
  db.insert('authors', {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    designation: designation.trim(),
    photo: photo.trim(),
    bio: bio.trim(),
    social: {
      linkedin: (linkedin || '').trim(),
      twitter: (twitter || '').trim()
    }
  });
  res.redirect('/blog/admin/authors');
});

router.post('/authors/update/:id', (req, res) => {
  const { name, slug, designation, photo, bio, linkedin, twitter } = req.body;
  db.update('authors', a => a.id === req.params.id, {
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    designation: designation.trim(),
    photo: photo.trim(),
    bio: bio.trim(),
    social: {
      linkedin: (linkedin || '').trim(),
      twitter: (twitter || '').trim()
    }
  });
  res.redirect('/blog/admin/authors');
});

router.post('/authors/delete/:id', (req, res) => {
  db.delete('authors', a => a.id === req.params.id);
  res.redirect('/blog/admin/authors');
});

// ==========================================================================
// MEDIA LIBRARY & IMAGE COMPRESSION (using sharp)
// ==========================================================================

router.get('/media', (req, res) => {
  const searchVal = req.query.search;
  const dateFilter = req.query.date || '';
  
  const allMedia = db.getCollection('media');
  const availableMonths = getUniqueMonths(allMedia, 'uploadedAt');
  
  let media = [...allMedia];
  
  if (searchVal) {
    const q = searchVal.toLowerCase();
    media = media.filter(m => (m.altText || '').toLowerCase().includes(q));
  }
  if (dateFilter) {
    media = media.filter(m => {
      const d = new Date(m.uploadedAt);
      if (isNaN(d.getTime())) return false;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}` === dateFilter;
    });
  }

  // Sort latest first
  media = media.sort((a, b) => b.uploadedAt - a.uploadedAt);

  res.render('admin/media', {
    activeNav: 'media',
    media,
    searchVal,
    availableMonths,
    dateFilter
  });
});

router.post('/media/bulk', (req, res) => {
  const { action } = req.body;
  let ids = req.body.ids;
  if (!ids) return res.redirect('/blog/admin/media');
  if (!Array.isArray(ids)) ids = [ids];

  if (action === 'delete') {
    ids.forEach(id => {
      const mediaObj = db.findOne('media', m => m.id === id);
      if (mediaObj) {
        const filePath = path.join(UPLOADS_DIR, mediaObj.filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error('Could not delete bulk file:', e);
        }
        db.delete('media', m => m.id === id);
      }
    });
  }

  res.redirect('/blog/admin/media');
});

router.post('/media/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    if (req.query.json === 'true' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(400).json({ success: false, error: 'No file selected.' });
    }
    return res.redirect('/blog/admin/media');
  }

  const { altText } = req.body;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const rawBaseName = path.basename(req.file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  const webpFilename = `img-${Date.now()}-${rawBaseName}.webp`;
  const destPath = path.join(UPLOADS_DIR, webpFilename);

  let finalWidth = 800;
  let finalHeight = 450;
  let finalSize = req.file.size;
  let fileUrlPath = '';
  let writtenToDisk = false;

  try {
    if (sharp) {
      // 1. Process and compress image in-memory using sharp to WebP format
      await sharp(req.file.buffer)
        .resize(finalWidth, finalHeight, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(destPath);
      
      // Get final file size
      finalSize = fs.statSync(destPath).size;
      writtenToDisk = true;
    } else {
      // Fallback: write buffer to file without sharp processing
      fs.writeFileSync(destPath, req.file.buffer);
      writtenToDisk = true;
    }
    fileUrlPath = `/uploads/${sharp ? webpFilename : req.file.filename || `raw-${Date.now()}-${rawBaseName}${ext}`}`;
  } catch (e) {
    console.warn('Image write to disk failed (possibly read-only filesystem). Falling back to Base64:', e);
    // Fallback: encode file buffer to base64 data URI
    const base64Data = req.file.buffer.toString('base64');
    const mime = req.file.mimetype || 'image/jpeg';
    fileUrlPath = `data:${mime};base64,${base64Data}`;
  }

  const filenameValue = writtenToDisk ? (sharp ? webpFilename : req.file.filename || `raw-${Date.now()}-${rawBaseName}${ext}`) : `base64-${Date.now()}`;

  db.insert('media', {
    filename: filenameValue,
    url: fileUrlPath,
    altText: altText ? altText.trim() : 'Importerr product image',
    width: finalWidth,
    height: finalHeight,
    sizeBytes: finalSize,
    uploadedAt: Date.now()
  });

  if (req.query.json === 'true' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({ success: true, url: fileUrlPath });
  }

  res.redirect('/blog/admin/media');
});

router.post('/media/delete/:id', (req, res) => {
  const mediaObj = db.findOne('media', m => m.id === req.params.id);
  if (mediaObj) {
    const filePath = path.join(UPLOADS_DIR, mediaObj.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Could not unlink media file:', e);
    }
    db.delete('media', m => m.id === req.params.id);
  }
  res.redirect('/blog/admin/media');
});

// ==========================================================================
// REDIRECT RULES MANAGEMENT CRUD
// ==========================================================================

router.get('/redirects', (req, res) => {
  const redirects = db.getCollection('redirects');
  res.render('admin/redirects', {
    activeNav: 'redirects',
    redirects
  });
});

router.post('/redirects/create', (req, res) => {
  const { fromPath, toPath } = req.body;
  db.insert('redirects', {
    fromPath: fromPath.trim(),
    toPath: toPath.trim(),
    type: '301'
  });
  res.redirect('/blog/admin/redirects');
});

router.post('/redirects/delete/:id', (req, res) => {
  db.delete('redirects', r => r.id === req.params.id);
  res.redirect('/blog/admin/redirects');
});

// ==========================================================================
// INTEGRATION SETTINGS MANAGEMENT
// ==========================================================================

router.get('/settings', (req, res) => {
  const settings = db.findOne('settings') || {};
  res.render('admin/settings', {
    activeNav: 'settings',
    settings,
    success: req.query.success === 'true' ? 'Integration settings updated successfully!' : null
  });
});

router.post('/settings/update', (req, res) => {
  const { google_analytics_id, google_tag_manager_id, cta_title, cta_subtitle, cta_btn_text, cta_btn_url, header_logo_url, footer_logo_url } = req.body;
  
  const header_labels = Array.isArray(req.body.header_label) ? req.body.header_label : [req.body.header_label].filter(Boolean);
  const header_urls = Array.isArray(req.body.header_url) ? req.body.header_url : [req.body.header_url].filter(Boolean);
  const footer_labels = Array.isArray(req.body.footer_label) ? req.body.footer_label : [req.body.footer_label].filter(Boolean);
  const footer_urls = Array.isArray(req.body.footer_url) ? req.body.footer_url : [req.body.footer_url].filter(Boolean);

  const header_links = [];
  for (let i = 0; i < Math.max(header_labels.length, header_urls.length); i++) {
    const label = (header_labels[i] || '').trim();
    const url = (header_urls[i] || '').trim();
    if (label && url) {
      header_links.push({ label, url });
    }
  }

  const footer_links = [];
  for (let i = 0; i < Math.max(footer_labels.length, footer_urls.length); i++) {
    const label = (footer_labels[i] || '').trim();
    const url = (footer_urls[i] || '').trim();
    if (label && url) {
      footer_links.push({ label, url });
    }
  }

  db.update('settings', () => true, {
    google_analytics_id: (google_analytics_id || '').trim(),
    google_tag_manager_id: (google_tag_manager_id || '').trim(),
    default_cta: {
      title: cta_title.trim(),
      subtitle: cta_subtitle.trim(),
      buttonText: cta_btn_text.trim(),
      buttonUrl: cta_btn_url.trim()
    },
    header_links,
    footer_links,
    header_logo_url: (header_logo_url || '').trim(),
    footer_logo_url: (footer_logo_url || '').trim()
  });

  res.redirect('/blog/admin/settings?success=true');
});

// ==========================================================================
// COMMENTS MODERATION MANAGEMENT
// ==========================================================================

router.get('/comments', (req, res) => {
  const statusFilter = req.query.status || '';
  const searchVal = req.query.search || '';
  const dateFilter = req.query.date || '';
  
  const allComments = db.getCollection('comments');
  const availableMonths = getUniqueMonths(allComments, 'createdAt');
  
  let comments = [...allComments];

  // Filter by status if specified
  if (statusFilter) {
    comments = comments.filter(c => c.status === statusFilter);
  }

  // Filter by search query (author name, email, or content)
  if (searchVal) {
    const q = searchVal.toLowerCase();
    comments = comments.filter(c => 
      c.authorName.toLowerCase().includes(q) ||
      c.authorEmail.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q) ||
      c.articleTitle.toLowerCase().includes(q)
    );
  }

  // Filter by month/year
  if (dateFilter) {
    comments = comments.filter(c => {
      const d = new Date(c.createdAt);
      if (isNaN(d.getTime())) return false;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}` === dateFilter;
    });
  }

  // Sort by newest first
  comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('admin/comments', {
    activeNav: 'comments',
    comments,
    statusFilter,
    searchVal,
    availableMonths,
    dateFilter
  });
});

router.post('/comments/bulk', (req, res) => {
  const { action } = req.body;
  let ids = req.body.ids;
  if (!ids) return res.redirect('/blog/admin/comments');
  if (!Array.isArray(ids)) ids = [ids];

  if (action === 'approve') {
    ids.forEach(id => {
      db.update('comments', c => c.id === id, { status: 'approved' });
    });
  } else if (action === 'spam') {
    ids.forEach(id => {
      db.update('comments', c => c.id === id, { status: 'spam' });
    });
  } else if (action === 'delete') {
    ids.forEach(id => {
      db.delete('comments', c => c.id === id);
    });
  }

  res.redirect('/blog/admin/comments');
});

router.post('/comments/approve/:id', (req, res) => {
  db.update('comments', c => c.id === req.params.id, { status: 'approved' });
  res.redirect('/blog/admin/comments');
});

router.post('/comments/spam/:id', (req, res) => {
  db.update('comments', c => c.id === req.params.id, { status: 'spam' });
  res.redirect('/blog/admin/comments');
});

router.post('/comments/delete/:id', (req, res) => {
  db.delete('comments', c => c.id === req.params.id);
  res.redirect('/blog/admin/comments');
});

// ==========================================================================
// SUBSCRIBERS LIST MANAGEMENT
// ==========================================================================

router.get('/subscribers', (req, res) => {
  const searchVal = req.query.search || '';
  const dateFilter = req.query.date || '';
  
  const allSubscribers = db.getCollection('subscribers');
  const availableMonths = getUniqueMonths(allSubscribers, 'subscribedAt');
  
  let subscribers = [...allSubscribers];

  if (searchVal) {
    const q = searchVal.toLowerCase();
    subscribers = subscribers.filter(s => s.email.toLowerCase().includes(q));
  }
  
  if (dateFilter) {
    subscribers = subscribers.filter(s => {
      const d = new Date(s.subscribedAt);
      if (isNaN(d.getTime())) return false;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}` === dateFilter;
    });
  }

  // Sort by newest first
  subscribers.sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));

  res.render('admin/subscribers', {
    activeNav: 'subscribers',
    subscribers,
    searchVal,
    availableMonths,
    dateFilter
  });
});

router.post('/subscribers/bulk', (req, res) => {
  const { action } = req.body;
  let ids = req.body.ids;
  if (!ids) return res.redirect('/blog/admin/subscribers');
  if (!Array.isArray(ids)) ids = [ids];

  if (action === 'delete') {
    ids.forEach(id => {
      db.delete('subscribers', s => s.id === id);
    });
  }

  res.redirect('/blog/admin/subscribers');
});

router.post('/subscribers/delete/:id', (req, res) => {
  db.delete('subscribers', s => s.id === req.params.id);
  res.redirect('/blog/admin/subscribers');
});

// CMS Article Background Auto-Save API Endpoint
router.post('/api/autosave', (req, res) => {
  let { id } = req.body;
  const {
    title, slug, excerpt, content, featuredImage, category, tags, author, status,
    isFeatured, pillarArticle, publishedAt, seo_title, seo_description, canonical_url,
    og_title, og_description, og_image, twitter_title, twitter_description, seo_index, seo_follow,
    key_takeaways, faq_q, faq_a
  } = req.body;

  // Compile Key Takeaways
  const takeawaysList = (key_takeaways || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Compile FAQs
  const faqList = [];
  if (faq_q && faq_a) {
    const questions = Array.isArray(faq_q) ? faq_q : [faq_q];
    const answers = Array.isArray(faq_a) ? faq_a : [faq_a];
    
    questions.forEach((q, idx) => {
      if (q.trim() && answers[idx] && answers[idx].trim()) {
        faqList.push({ q: q.trim(), a: answers[idx].trim() });
      }
    });
  }

  let finalSlug = (slug || '').trim();
  if (!finalSlug && title) {
    finalSlug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  }

  const now = new Date().toISOString();
  
  const articleData = {
    title: (title || 'Untitled Draft').trim(),
    slug: finalSlug,
    excerpt: (excerpt || '').trim(),
    content: content || '',
    featuredImage: (featuredImage || '').trim() || 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&h=450&q=80',
    category: category || '',
    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
    author: author || 'auth_1',
    status: status || 'draft',
    isFeatured: isFeatured === 'true',
    pillarArticle: pillarArticle === 'true',
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
    updatedAt: now,
    keyTakeaways: takeawaysList,
    faq: faqList,
    seo: {
      title: (seo_title || '').trim(),
      description: (seo_description || '').trim(),
      canonicalUrl: (canonical_url || '').trim(),
      ogTitle: (og_title || '').trim(),
      ogDescription: (og_description || '').trim(),
      ogImage: (og_image || '').trim(),
      twitterTitle: (twitter_title || '').trim(),
      twitterDescription: (twitter_description || '').trim(),
      index: seo_index === 'true',
      follow: seo_follow === 'true'
    }
  };

  let articleId = id;
  if (articleId) {
    const existing = db.findOne('articles', a => a.id === articleId);
    if (existing) {
      if (existing.publishedAt) {
        articleData.publishedAt = existing.publishedAt;
      }
      db.update('articles', a => a.id === articleId, articleData);
    } else {
      articleData.id = articleId;
      db.insert('articles', articleData);
    }
  } else {
    const inserted = db.insert('articles', articleData);
    articleId = inserted.id;
  }

  res.json({ success: true, id: articleId, updatedAt: now });
});

module.exports = router;
