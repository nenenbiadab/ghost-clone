const express = require('express');
const router = express.Router();
const db = require('../config/db');
const helpers = require('../utils/helpers');
const markdown = require('../utils/markdown');
const RSS = require('rss');

// ===== HOMEPAGE =====
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = parseInt(res.locals.site.posts_per_page || '10', 10);
    const offset = (page - 1) * limit;

    let where = "p.status='published' AND p.visibility='public'";
    const params = [];
    if (q) {
      where += ' AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.markdown LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS c FROM posts p WHERE ${where}`,
      params
    );
    const total = countRows[0].c;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [posts] = await db.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.feature_image, p.featured,
              p.published_at, p.views, p.markdown, u.name AS author_name
       FROM posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE ${where}
       ORDER BY p.featured DESC, p.published_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const enriched = posts.map(p => ({
      ...p,
      feature_image: helpers.getFeatureImage(p),
      formattedDate: helpers.formatDate(p.published_at),
      readTime: helpers.readingTime(p.markdown || p.excerpt || '')
    }));

    // Feature hanya di page 1, bukan hasil search
    const featured = (page === 1 && !q) ? enriched.find(p => p.featured) : null;
    const rest = featured ? enriched.filter(p => p.id !== featured.id) : enriched;

    // Popular tags
    const [tags] = await db.query(`
      SELECT t.name, t.slug, COUNT(pt.post_id) AS count
      FROM tags t
      JOIN posts_tags pt ON t.id = pt.tag_id
      JOIN posts p ON pt.post_id = p.id
      WHERE p.status = 'published'
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 12
    `);

    res.render('public/home', {
      pageTitle: q ? `Search: ${q}` : res.locals.site.site_title,
      pageDescription: res.locals.site.site_description || '',
      featured,
      posts: rest,
      tags,
      searchQuery: q,
      page,
      totalPages
    });
  } catch (e) {
    next(e);
  }
});

// ===== SINGLE POST =====
router.get('/post/:slug', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.name AS author_name, u.bio AS author_bio, u.avatar AS author_avatar
       FROM posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.slug = ? LIMIT 1`,
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).render('404');
    const post = rows[0];

    // Block draft/private untuk non-admin
    if (post.status !== 'published' || post.visibility !== 'public') {
      if (!req.session.user) return res.status(404).render('404');
    }

    // Track views (non-blocking best-effort)
    db.query('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]).catch(() => {});

    // Tags
    const [tags] = await db.query(
      `SELECT t.name, t.slug FROM tags t
       JOIN posts_tags pt ON t.id = pt.tag_id
       WHERE pt.post_id = ?`,
      [post.id]
    );

    // Related posts (match by shared tag, fallback to newest)
    let related = [];
    if (tags.length) {
      const tagSlugs = tags.map(t => t.slug);
      const [tagIdRows] = await db.query(
        `SELECT id FROM tags WHERE slug IN (${tagSlugs.map(() => '?').join(',')})`,
        tagSlugs
      );
      const tagIds = tagIdRows.map(r => r.id);

      if (tagIds.length) {
        const [rel] = await db.query(
          `SELECT DISTINCT p.id, p.title, p.slug, p.feature_image, p.published_at, p.excerpt
           FROM posts p
           JOIN posts_tags pt ON p.id = pt.post_id
           WHERE pt.tag_id IN (${tagIds.map(() => '?').join(',')})
             AND p.id != ? AND p.status='published' AND p.visibility='public'
           ORDER BY p.published_at DESC LIMIT 3`,
          [...tagIds, post.id]
        );
        related = rel;
      }
    }

    if (related.length < 3) {
      const excludeIds = [post.id, ...related.map(r => r.id)];
      const [more] = await db.query(
        `SELECT id, title, slug, feature_image, published_at, excerpt
         FROM posts
         WHERE id NOT IN (${excludeIds.map(() => '?').join(',')})
           AND status='published' AND visibility='public'
         ORDER BY published_at DESC LIMIT ?`,
        [...excludeIds, 3 - related.length]
      );
      related = [...related, ...more];
    }

    related = related.map(r => ({
      ...r,
      feature_image: helpers.getFeatureImage(r),
      formattedDate: helpers.formatDate(r.published_at)
    }));

    // Sidebar data (single post)
    const [sidebarTags] = await db.query(`
      SELECT t.name, t.slug, COUNT(pt.post_id) AS count
      FROM tags t
      JOIN posts_tags pt ON t.id = pt.tag_id
      JOIN posts p ON pt.post_id = p.id
      WHERE p.status = 'published' AND p.visibility='public'
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 10
    `);

    const [sidebarCategories] = await db.query(`
      SELECT t.name AS category, COUNT(pt.post_id) AS count
      FROM tags t
      JOIN posts_tags pt ON t.id = pt.tag_id
      JOIN posts p ON p.id = pt.post_id
      WHERE p.status='published' AND p.visibility='public'
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC
      LIMIT 10
    `);

    const [sidebarRecentRows] = await db.query(`
      SELECT id, title, slug, feature_image, published_at
      FROM posts
      WHERE status='published' AND visibility='public' AND id != ?
      ORDER BY published_at DESC
      LIMIT 5
    `, [post.id]);

    const sidebarRecent = sidebarRecentRows.map(p => ({
      ...p,
      feature_image: helpers.getFeatureImage(p),
      formattedDate: helpers.formatDate(p.published_at)
    }));

    // Pastikan html tersedia (kalau post lama tidak punya html cache)
    const html = post.html || markdown.render(post.markdown || '');

    res.render('public/post', {
      pageTitle: post.meta_title || post.title,
      pageDescription: post.meta_description || post.excerpt || '',
      post: {
        ...post,
        feature_image: helpers.getFeatureImage(post),
        formattedDate: helpers.formatDate(post.published_at || post.created_at),
        isoDate: helpers.formatISO(post.published_at || post.created_at),
        readTime: helpers.readingTime(post.markdown || '')
      },
      html,
      tags,
      related,
      sidebarTags,
      sidebarCategories,
      sidebarRecent,
      canonicalUrl: `${res.locals.siteUrl}/post/${post.slug}`
    });
  } catch (e) {
    next(e);
  }
});

// ===== TAG PAGE =====
router.get('/tag/:slug', async (req, res, next) => {
  try {
    const [tagRows] = await db.query('SELECT * FROM tags WHERE slug = ? LIMIT 1', [req.params.slug]);
    if (tagRows.length === 0) return res.status(404).render('404');
    const tag = tagRows[0];

    const [posts] = await db.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.feature_image, p.published_at, p.markdown
       FROM posts p
       JOIN posts_tags pt ON p.id = pt.post_id
       WHERE pt.tag_id = ? AND p.status='published' AND p.visibility='public'
       ORDER BY p.published_at DESC`,
      [tag.id]
    );

    const enriched = posts.map(p => ({
      ...p,
      feature_image: helpers.getFeatureImage(p),
      formattedDate: helpers.formatDate(p.published_at),
      readTime: helpers.readingTime(p.markdown || '')
    }));

    res.render('public/tag', {
      pageTitle: `#${tag.name}`,
      pageDescription: tag.description || `Posts tagged "${tag.name}"`,
      tag,
      posts: enriched
    });
  } catch (e) {
    next(e);
  }
});

// ===== STATIC PAGES =====
router.get('/about', (req, res) => {
  res.render('public/about', {
    pageTitle: 'About Us',
    pageDescription: 'Tentang kami'
  });
});

router.get('/lainnya', (req, res) => {
  res.render('public/lainnya', {
    pageTitle: 'Lainnya',
    pageDescription: 'Halaman sample lainnya'
  });
});

// ===== THEME TOGGLE =====
router.post('/theme', (req, res) => {
  const theme = req.body.theme === 'dark' ? 'dark' : 'light';
  res.cookie('theme', theme, {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax'
  });
  res.json({ ok: true, theme });
});

// ===== RSS =====
router.get('/rss.xml', async (req, res, next) => {
  try {
    const site = res.locals.site;
    const siteUrl = res.locals.siteUrl;

    const feed = new RSS({
      title: site.site_title,
      description: site.site_description,
      feed_url: `${siteUrl}/rss.xml`,
      site_url: siteUrl,
      language: 'id'
    });

    const [posts] = await db.query(
      `SELECT title, slug, excerpt, html, published_at
       FROM posts
       WHERE status='published' AND visibility='public'
       ORDER BY published_at DESC LIMIT 20`
    );

    posts.forEach(p => {
      feed.item({
        title: p.title,
        description: p.html || p.excerpt || '',
        url: `${siteUrl}/post/${p.slug}`,
        date: p.published_at
      });
    });

    res.type('application/rss+xml').send(feed.xml({ indent: true }));
  } catch (e) {
    next(e);
  }
});

// ===== SITEMAP =====
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const siteUrl = res.locals.siteUrl;
    const [posts] = await db.query(
      `SELECT slug, updated_at FROM posts
       WHERE status='published' AND visibility='public'`
    );
    const [tags] = await db.query('SELECT slug FROM tags');

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `<url><loc>${siteUrl}/</loc><changefreq>daily</changefreq></url>\n`;
    posts.forEach(p => {
      xml += `<url><loc>${siteUrl}/post/${p.slug}</loc><lastmod>${helpers.formatISO(p.updated_at)}</lastmod></url>\n`;
    });
    tags.forEach(t => {
      xml += `<url><loc>${siteUrl}/tag/${t.slug}</loc></url>\n`;
    });
    xml += '</urlset>';

    res.type('application/xml').send(xml);
  } catch (e) {
    next(e);
  }
});

// ===== ROBOTS =====
router.get('/robots.txt', (req, res) => {
  const siteUrl = res.locals.siteUrl;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /setup\n\nSitemap: ${siteUrl}/sitemap.xml\n`
  );
});

module.exports = router;
