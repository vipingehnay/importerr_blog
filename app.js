const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieSession = require('cookie-session');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8001;

// 1. Setup template engine and directories
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets from public/ folder
app.use(express.static(path.join(__dirname, 'public')));

// Parse form inputs & JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 2. Cookie Session Middleware for secure Admin logins
app.use(cookieSession({
  name: 'importerr_cms_session',
  keys: ['importerr-secure-secret-key-2026'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// 3. 301 Redirects Interception Middleware (runs before all routes)
app.use((req, res, next) => {
  const incomingPath = req.path.toLowerCase().replace(/\/$/, ''); // strip trailing slash and lowercase
  
  const redirectRule = db.findOne('redirects', r => {
    const cleanFrom = r.fromPath.toLowerCase().replace(/\/$/, '');
    return cleanFrom === incomingPath;
  });

  if (redirectRule) {
    console.log(`Executing 301 Redirect: ${req.url} -> ${redirectRule.toPath}`);
    return res.redirect(301, redirectRule.toPath);
  }
  next();
});

// Load routes
const blogRoutes = require('./routes/blog');
const adminRoutes = require('./routes/admin');

// Register routes
app.use('/blog/admin', adminRoutes);
app.use('/blog', blogRoutes);

// Root redirect (optional: if a user hits port 8001 root, forward to /blog)
app.get('/', (req, res) => {
  res.redirect('/blog');
});

// ==========================================================================
// SEO FILES (Sitemap & Robots.txt)
// ==========================================================================

// XML Sitemap Endpoint (supports /sitemap.xml and /blog/sitemap.xml)
const generateSitemap = (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  // Fetch active collections
  const articles = db.find('articles', a => a.status === 'published');
  const categories = db.find('categories', c => c.status === 'active');
  const tags = db.find('tags', t => t.status === 'active');
  const authors = db.getCollection('authors');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Add blog home
  xml += `  <url>\n    <loc>${baseUrl}/blog</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  // Add published articles
  articles.forEach(art => {
    const date = art.updatedAt || art.publishedAt || new Date().toISOString();
    xml += `  <url>\n    <loc>${baseUrl}/blog/${art.slug}</loc>\n    <lastmod>${date.substring(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  // Add categories
  categories.forEach(cat => {
    xml += `  <url>\n    <loc>${baseUrl}/blog/category/${cat.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  });

  // Add indexable tags (exclude status = noindex)
  tags.forEach(tag => {
    xml += `  <url>\n    <loc>${baseUrl}/blog/tag/${tag.slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.4</priority>\n  </url>\n`;
  });

  // Add authors
  authors.forEach(auth => {
    xml += `  <url>\n    <loc>${baseUrl}/blog/author/${auth.slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.4</priority>\n  </url>\n`;
  });

  xml += '</urlset>';

  res.header('Content-Type', 'application/xml');
  res.send(xml);
};

app.get('/sitemap.xml', generateSitemap);
app.get('/blog/sitemap.xml', generateSitemap);

// Robots.txt Endpoint (supports /robots.txt and /blog/robots.txt)
const serveRobots = (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  let txt = 'User-agent: *\n';
  txt += 'Disallow: /blog/admin/\n'; // Protect admin panel
  txt += 'Disallow: /blog/search\n'; // Prevent indexing search parameters
  txt += 'Allow: /blog/\n';
  txt += 'Allow: /public/\n';
  txt += `Sitemap: ${baseUrl}/sitemap.xml\n`;

  res.header('Content-Type', 'text/plain');
  res.send(txt);
};

app.get('/robots.txt', serveRobots);
app.get('/blog/robots.txt', serveRobots);

// ==========================================================================
// ERROR HANDLING BOUNDARIES (404 and 500 pages)
// ==========================================================================

// Custom 404 View Boundary
app.use((req, res) => {
  res.status(404);
  const settings = db.findOne('settings') || {};
  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    articles: [],
    archiveTitle: '404 Page Not Found',
    archiveType: 'error404',
    globalSettings: settings,
    seo: {
      title: '404 Not Found | Importerr Sourcing Blog',
      description: 'The requested page could not be located on Importerr Blog.',
      canonicalUrl: '',
      index: false,
      follow: false
    }
  });
});

// Custom 500 View Boundary
app.use((err, req, res, next) => {
  console.error('Unhandled System Error:', err);
  res.status(500);
  const settings = db.findOne('settings') || {};
  res.render('blog/archive', {
    baseUrl: `${req.protocol}://${req.get('host')}`,
    currentUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    articles: [],
    archiveTitle: '500 Server Error',
    archiveType: 'error500',
    globalSettings: settings,
    seo: {
      title: '500 Server Error | Importerr Sourcing Blog',
      description: 'An internal system error has occurred. Our team has been notified.',
      canonicalUrl: '',
      index: false,
      follow: false
    }
  });
});

// 4. Start listening
app.listen(PORT, () => {
  console.log(`Importerr Blog & CMS running successfully at http://localhost:${PORT}/`);
  console.log(`Blog Listing: http://localhost:${PORT}/blog`);
  console.log(`CMS Admin: http://localhost:${PORT}/blog/admin`);
});
