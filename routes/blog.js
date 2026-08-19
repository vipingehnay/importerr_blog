const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper to auto-publish scheduled articles
function checkScheduledArticles() {
  const now = new Date();
  const articles = db.getCollection('articles');
  let updated = false;
  
  articles.forEach(art => {
    if (art.status === 'scheduled' && new Date(art.publishedAt) <= now) {
      art.status = 'published';
      art.updatedAt = now.toISOString();
      updated = true;
    }
  });

  if (updated) {
    db.forceSave('articles');
  }
}

// Helper to calculate reading time
function calculateReadingTime(htmlContent) {
  const text = htmlContent.replace(/<[^>]*>/g, ' '); // Strip HTML tags
  const words = text.trim().split(/\s+/).length;
  const wpm = 200; // Average reading speed
  const minutes = Math.ceil(words / wpm);
  return `${minutes} min read`;
}

// Helper to format dates
function formatArticleDates(art) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  return {
    ...art,
    formattedPublishDate: formatDate(art.publishedAt),
    formattedUpdateDate: formatDate(art.updatedAt),
    readingTime: calculateReadingTime(art.content || '')
  };
}

// Helper to populate author and category names
function populateRelations(art) {
  const category = db.findOne('categories', c => c.slug === art.category);
  const author = db.findOne('authors', a => a.slug === art.author);
  
  return {
    ...art,
    categoryName: category ? category.name : 'Uncategorized',
    authorName: author ? author.name : 'Unknown Author',
    authorPhoto: author ? author.photo : '',
    authorBio: author ? author.bio : '',
    authorSlug: author ? author.slug : '',
    authorSocial: author ? author.social : {}
  };
}

// 1. PUBLIC BLOG LISTING (GET /blog)
router.get('/', (req, res) => {
  checkScheduledArticles();
  
  const settings = db.findOne('settings') || {};
  const categories = db.find('categories', c => c.status === 'active');
  const allArticles = db.find('articles', a => a.status === 'published')
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map(populateRelations)
    .map(formatArticleDates);

  // Find Featured Post
  let featuredArticle = allArticles.find(a => a.isFeatured);
  if (!featuredArticle && allArticles.length > 0) {
    // Fall back to latest article
    featuredArticle = allArticles[0];
  }

  // Exclude featured article from the regular grid
  const gridArticles = featuredArticle 
    ? allArticles.filter(a => a.id !== featuredArticle.id)
    : allArticles;

  const currentUrl = `${req.protocol}://${req.get('host')}/blog`;

  res.render('blog/index', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl,
    categories,
    featuredArticle,
    articles: gridArticles,
    globalSettings: settings,
    seo: {
      title: 'Importerr Blog | Sourcing & Importing Guides',
      description: 'Practical guides and resources for sourcing products, verifying China suppliers, and scaling your e-commerce brand.',
      canonicalUrl: currentUrl,
      index: true,
      follow: true
    }
  });
});

// 2. SEARCH PAGE (GET /blog/search)
router.get('/search', (req, res) => {
  checkScheduledArticles();
  
  const query = (req.query.q || '').trim().toLowerCase();
  const settings = db.findOne('settings') || {};
  
  let matchingArticles = [];
  if (query) {
    matchingArticles = db.find('articles', a => {
      if (a.status !== 'published') return false;
      
      const titleMatch = (a.title || '').toLowerCase().includes(query);
      const contentMatch = (a.content || '').toLowerCase().includes(query);
      const excerptMatch = (a.excerpt || '').toLowerCase().includes(query);
      const categoryMatch = (a.category || '').toLowerCase().includes(query);
      const tagsMatch = (a.tags || []).some(t => t.toLowerCase().includes(query));
      
      return titleMatch || contentMatch || excerptMatch || categoryMatch || tagsMatch;
    });
  }

  const articles = matchingArticles
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map(populateRelations)
    .map(formatArticleDates);

  const currentUrl = `${req.protocol}://${req.get('host')}/blog/search?q=${encodeURIComponent(query)}`;

  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl,
    articles,
    archiveTitle: `Search: "${query}"`,
    archiveType: 'search',
    query,
    globalSettings: settings,
    seo: {
      title: `Search Results for "${query}" | Importerr Blog`,
      description: `Browse articles and guides matching "${query}" on Importerr Sourcing Blog.`,
      canonicalUrl: currentUrl,
      index: false, // Don't index search result pages
      follow: true
    }
  });
});

// 3. CATEGORY ARCHIVES (GET /blog/category/:slug)
router.get('/category/:slug', (req, res) => {
  checkScheduledArticles();
  
  const slug = req.params.slug;
  const settings = db.findOne('settings') || {};
  const categoryInfo = db.findOne('categories', c => c.slug === slug);

  if (!categoryInfo) {
    return res.status(404).render('blog/archive', {
      baseUrl: `${req.protocol}://${req.get('host')}`,
      currentUrl: `${req.protocol}://${req.get('host')}/blog/category/${slug}`,
      articles: [],
      archiveTitle: 'Category Not Found',
      archiveType: 'category',
      categoryInfo: null,
      globalSettings: settings,
      seo: { title: '404 Category Not Found', description: 'Category not found on Importerr Blog.', index: false, follow: true }
    });
  }

  const articles = db.find('articles', a => a.status === 'published' && a.category === slug)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map(populateRelations)
    .map(formatArticleDates);

  const currentUrl = `${req.protocol}://${req.get('host')}/blog/category/${slug}`;

  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl,
    articles,
    archiveTitle: categoryInfo.name,
    archiveType: 'category',
    categoryInfo,
    globalSettings: settings,
    seo: {
      title: categoryInfo.seoTitle || `${categoryInfo.name} Archives | Importerr Blog`,
      description: categoryInfo.metaDescription || categoryInfo.description,
      canonicalUrl: currentUrl,
      index: true,
      follow: true
    }
  });
});

// 4. TAG ARCHIVES (GET /blog/tag/:slug)
router.get('/tag/:slug', (req, res) => {
  checkScheduledArticles();
  
  const slug = req.params.slug;
  const settings = db.findOne('settings') || {};
  const tagInfo = db.findOne('tags', t => t.slug === slug);

  if (!tagInfo) {
    return res.status(404).render('blog/archive', {
      baseUrl: `${req.protocol}://${req.get('host')}`,
      currentUrl: `${req.protocol}://${req.get('host')}/blog/tag/${slug}`,
      articles: [],
      archiveTitle: 'Tag Not Found',
      archiveType: 'tag',
      globalSettings: settings,
      seo: { title: '404 Tag Not Found', description: 'Tag not found on Importerr Blog.', index: false, follow: true }
    });
  }

  const articles = db.find('articles', a => a.status === 'published' && a.tags.includes(slug))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map(populateRelations)
    .map(formatArticleDates);

  const currentUrl = `${req.protocol}://${req.get('host')}/blog/tag/${slug}`;
  const shouldIndex = tagInfo.status !== 'noindex';

  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl,
    articles,
    archiveTitle: tagInfo.name,
    archiveType: 'tag',
    globalSettings: settings,
    seo: {
      title: `Guides tagged with #${tagInfo.name} | Importerr Blog`,
      description: tagInfo.description || `Browse sourcing guides tagged with #${tagInfo.name}.`,
      canonicalUrl: currentUrl,
      index: shouldIndex,
      follow: true
    }
  });
});

// 5. AUTHOR ARCHIVES (GET /blog/author/:slug)
router.get('/author/:slug', (req, res) => {
  checkScheduledArticles();
  
  const slug = req.params.slug;
  const settings = db.findOne('settings') || {};
  const authorInfo = db.findOne('authors', a => a.slug === slug);

  if (!authorInfo) {
    return res.status(404).render('blog/archive', {
      baseUrl: `${req.protocol}://${req.get('host')}`,
      currentUrl: `${req.protocol}://${req.get('host')}/blog/author/${slug}`,
      articles: [],
      archiveTitle: 'Author Not Found',
      archiveType: 'author',
      authorInfo: null,
      globalSettings: settings,
      seo: { title: '404 Author Not Found', description: 'Author not found on Importerr Blog.', index: false, follow: true }
    });
  }

  const articles = db.find('articles', a => a.status === 'published' && a.author === slug)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map(populateRelations)
    .map(formatArticleDates);

  const currentUrl = `${req.protocol}://${req.get('host')}/blog/author/${slug}`;

  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl,
    articles,
    archiveTitle: authorInfo.name,
    archiveType: 'author',
    authorInfo,
    globalSettings: settings,
    seo: {
      title: `${authorInfo.name}, Sourcing Author Profile | Importerr`,
      description: authorInfo.bio,
      canonicalUrl: currentUrl,
      index: true,
      follow: true
    }
  });
});

// 5.5 NEWSLETTER SUBSCRIBE (POST /blog/subscribe)
router.post('/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  
  // Check if already exists
  const existing = db.findOne('subscribers', s => s.email === cleanEmail);
  if (existing) {
    return res.json({ success: true, message: 'You are already subscribed!' });
  }

  db.insert('subscribers', {
    email: cleanEmail,
    subscribedAt: new Date().toISOString()
  });

  return res.json({ success: true, message: 'Thank you for subscribing to the Importerr newsletter!' });
});

// 5.6 SUBMIT COMMENT (POST /blog/:slug/comment)
router.post('/:slug/comment', (req, res) => {
  const slug = req.params.slug;
  const { authorName, authorEmail, content } = req.body;
  
  const article = db.findOne('articles', a => a.slug === slug);
  if (!article) {
    return res.status(404).send('Article not found.');
  }

  if (!authorName || !authorEmail || !content) {
    return res.redirect(`/blog/${slug}?comment_error=true#comments-section`);
  }

  // Insert comment as pending status
  db.insert('comments', {
    articleId: article.id,
    articleTitle: article.title,
    articleSlug: article.slug,
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim().toLowerCase(),
    content: content.trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  res.redirect(`/blog/${slug}?comment_pending=true#comments-section`);
});

// 6. SINGLE BLOG POST (GET /blog/:slug)
router.get('/:slug', (req, res) => {
  checkScheduledArticles();
  
  const slug = req.params.slug;
  const settings = db.findOne('settings') || {};
  
  const articleRaw = db.findOne('articles', a => a.slug === slug);
  
  if (!articleRaw || articleRaw.status !== 'published') {
    return res.status(404).render('blog/archive', {
      baseUrl: `${req.protocol}://${req.get('host')}`,
      currentUrl: `${req.protocol}://${req.get('host')}/blog/${slug}`,
      articles: [],
      archiveTitle: 'Article Not Found',
      archiveType: 'article',
      globalSettings: settings,
      seo: { title: '404 Article Not Found', description: 'Sourcing guide not found on Importerr Blog.', index: false, follow: true }
    });
  }

  const article = populateRelations(formatArticleDates(articleRaw));
  
  // Custom SEO Defaults
  const artSeo = {
    title: article.seo && article.seo.title ? article.seo.title : `${article.title} | Importerr`,
    description: article.seo && article.seo.description ? article.seo.description : article.excerpt,
    canonicalUrl: article.seo && article.seo.canonicalUrl ? article.seo.canonicalUrl : `${req.protocol}://${req.get('host')}/blog/${article.slug}`,
    ogTitle: article.seo && article.seo.ogTitle ? article.seo.ogTitle : article.title,
    ogDescription: article.seo && article.seo.ogDescription ? article.seo.ogDescription : article.excerpt,
    ogImage: article.seo && article.seo.ogImage ? article.seo.ogImage : article.featuredImage,
    twitterTitle: article.seo && article.seo.twitterTitle ? article.seo.twitterTitle : article.title,
    twitterDescription: article.seo && article.seo.twitterDescription ? article.seo.twitterDescription : article.excerpt,
    index: article.seo ? article.seo.index !== false : true,
    follow: article.seo ? article.seo.follow !== false : true
  };

  // Load approved comments linked to this article
  const comments = db.find('comments', c => c.articleId === article.id && c.status === 'approved')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 1. Related Articles: Same category, matching tags (Max 3, no duplicates, excluding current)
  const publishedOthers = db.find('articles', a => a.status === 'published' && a.id !== article.id);
  
  const related = publishedOthers
    .map(populateRelations)
    .map(formatArticleDates)
    .map(other => {
      let score = 0;
      if (other.category === article.category) score += 3; // Same category
      
      // Matching tags count
      const matches = (other.tags || []).filter(t => (article.tags || []).includes(t)).length;
      score += matches * 2;
      
      return { article: other, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.article.publishedAt) - new Date(a.article.publishedAt))
    .slice(0, 3)
    .map(item => item.article);

  // 2. Recommended Articles: "You May Also Like" (Max 3, excludes current AND related)
  const relatedIds = related.map(r => r.id);
  const recommended = publishedOthers
    .filter(other => !relatedIds.includes(other.id))
    .map(populateRelations)
    .map(formatArticleDates)
    // Different logic: popular/recent or cross-category
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 3);

  // Track event view log (in memory analytics counts)
  if (!articleRaw.views) articleRaw.views = 0;
  articleRaw.views++;
  db.forceSave('articles');

  res.render('blog/post', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl: `${req.protocol}://${req.get('host')}/blog/${article.slug}`,
    isArticle: true,
    ...article,
    seo: artSeo,
    relatedArticles: related,
    recommendedArticles: recommended,
    cta: settings.default_cta || null,
    globalSettings: settings,
    comments: comments,
    commentPending: req.query.comment_pending === 'true',
    commentError: req.query.comment_error === 'true'
  });
});

module.exports = router;
