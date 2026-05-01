const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const markdown = require('../utils/markdown');
const helpers = require('../utils/helpers');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Upload config (feature image local)
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Hanya file gambar yang diperbolehkan'));
    }
    cb(null, true);
  }
});

// Proteksi semua route admin
router.use(requireAuth);

// Upload endpoint: returns JSON { url: '/uploads/xxx.jpg' }
router.post('/upload-feature-image', upload.single('feature_image_file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'File tidak ditemukan' });
    return res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== DASHBOARD =====
router.get('/', async (req, res, next) => {
  try {
    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE status='published') AS published,
        (SELECT COUNT(*) FROM posts WHERE status='draft') AS drafts,
        (SELECT COALESCE(SUM(views),0) FROM posts) AS total_views,
        (SELECT COUNT(*) FROM tags) AS total_tags
    `);

    const [recentPosts] = await db.query(
      `SELECT id, title, slug, status, views, updated_at
       FROM posts ORDER BY updated_at DESC LIMIT 8`
    );

    const [topPosts] = await db.query(
      `SELECT id, title, slug, views FROM posts
       WHERE status='published' ORDER BY views DESC LIMIT 5`
    );

    res.render('admin/dashboard', { stats, recentPosts, topPosts, helpers });
  } catch (e) {
    next(e);
  }
});

// ===== POSTS LIST =====
router.get('/posts', async (req, res, next) => {
  try {
    const status = req.query.status || 'all';
    let sql = `SELECT id, title, slug, status, featured, views, published_at, updated_at
               FROM posts`;
    const params = [];
    if (status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY updated_at DESC';

    const [posts] = await db.query(sql, params);
    res.render('admin/posts', { posts, currentStatus: status, helpers });
  } catch (e) {
    next(e);
  }
});

// ===== NEW POST =====
router.get('/posts/new', (req, res) => {
  res.render('admin/editor', { post: null, tagsString: '' });
});

router.post('/posts/new', async (req, res, next) => {
  try {
    const {
      title, markdown: md, excerpt, feature_image,
      status, featured, visibility,
      meta_title, meta_description, tags
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).send('Title wajib diisi. <a href="javascript:history.back()">Back</a>');
    }

    const mdText = typeof md === 'string' ? md : '';
    const slug = helpers.makeUniqueSlug(title);
    let html = '';
    try { html = markdown.render(mdText); }
    catch (e) { console.error('[POST new] markdown render failed:', e.message); html = '<pre>' + mdText.replace(/</g,'&lt;') + '</pre>'; }

    const finalExcerpt = (excerpt && excerpt.trim()) || markdown.makeExcerpt(mdText, 200);
    const publishedAt = status === 'published' ? new Date() : null;

    const [result] = await db.query(
      `INSERT INTO posts
       (title, slug, markdown, html, excerpt, feature_image,
        status, visibility, featured,
        meta_title, meta_description, author_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(), slug, mdText, html, finalExcerpt, feature_image || null,
        status || 'draft', visibility || 'public', featured ? 1 : 0,
        meta_title || null, meta_description || null, req.session.user.id, publishedAt
      ]
    );

    await syncTags(result.insertId, tags);
    res.redirect('/admin/posts');
  } catch (e) {
    console.error('[POST new] FAIL:', e);
    next(e);
  }
});

// ===== EDIT POST =====
router.get('/posts/:id/edit', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Post not found');

    const [tagRows] = await db.query(
      `SELECT t.name FROM tags t
       JOIN posts_tags pt ON pt.tag_id = t.id
       WHERE pt.post_id = ?`,
      [req.params.id]
    );
    const tagsString = tagRows.map(t => t.name).join(', ');

    res.render('admin/editor', { post: rows[0], tagsString });
  } catch (e) {
    next(e);
  }
});

router.post('/posts/:id/edit', async (req, res, next) => {
  try {
    const {
      title, markdown: md, excerpt, feature_image,
      status, featured, visibility,
      meta_title, meta_description, tags
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).send('Title wajib diisi. <a href="javascript:history.back()">Back</a>');
    }

    const [[current]] = await db.query(
      'SELECT published_at, status FROM posts WHERE id = ?',
      [req.params.id]
    );
    if (!current) return res.status(404).send('Not found');

    const mdText = typeof md === 'string' ? md : '';
    let html = '';
    try { html = markdown.render(mdText); }
    catch (e) { console.error('[POST edit] markdown render failed:', e.message); html = '<pre>' + mdText.replace(/</g,'&lt;') + '</pre>'; }

    const finalExcerpt = (excerpt && excerpt.trim()) || markdown.makeExcerpt(mdText, 200);
    let publishedAt = current.published_at;
    if (status === 'published' && !publishedAt) publishedAt = new Date();

    await db.query(
      `UPDATE posts SET
         title=?, markdown=?, html=?, excerpt=?, feature_image=?,
         status=?, visibility=?, featured=?,
         meta_title=?, meta_description=?, published_at=?
       WHERE id=?`,
      [
        title.trim(), mdText, html, finalExcerpt, feature_image || null,
        status || 'draft', visibility || 'public', featured ? 1 : 0,
        meta_title || null, meta_description || null, publishedAt,
        req.params.id
      ]
    );

    await syncTags(req.params.id, tags);
    res.redirect('/admin/posts');
  } catch (e) {
    console.error('[POST edit] FAIL:', e);
    next(e);
  }
});

// ===== DELETE POST =====
router.post('/posts/:id/delete', async (req, res, next) => {
  try {
    await db.query('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.redirect('/admin/posts');
  } catch (e) {
    next(e);
  }
});

// Quick toggle status / feature
router.post('/posts/:id/toggle-feature', async (req, res, next) => {
  try {
    await db.query('UPDATE posts SET featured = NOT featured WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/app-passwords', async (req, res, next) => {
  try {
    const [keys] = await db.query(
      `SELECT id, name, created_at, last_used_at, revoked_at
       FROM application_passwords
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.session.user.id]
    );

    const flashPassword = req.session.newAppPassword || null;
    req.session.newAppPassword = null;

    res.render('admin/app-passwords', {
      keys,
      flashPassword
    });
  } catch (e) {
    next(e);
  }
});

router.post('/app-passwords/create', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim() || 'Tampermonkey Key';
    const raw = `${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
    const hash = await bcrypt.hash(raw, 10);

    await db.query(
      'INSERT INTO application_passwords (user_id, name, password_hash) VALUES (?, ?, ?)',
      [req.session.user.id, name, hash]
    );

    req.session.newAppPassword = raw;
    res.redirect('/admin/app-passwords');
  } catch (e) {
    next(e);
  }
});

router.post('/app-passwords/:id/revoke', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE application_passwords
       SET revoked_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.session.user.id]
    );
    res.redirect('/admin/app-passwords');
  } catch (e) {
    next(e);
  }
});

// ===== Helper: sync tags =====
async function syncTags(postId, tagsString) {
  const tagNames = helpers.parseTags(tagsString || '');

  // Hapus relasi lama
  await db.query('DELETE FROM posts_tags WHERE post_id = ?', [postId]);

  for (const name of tagNames) {
    const slug = helpers.makeSlug(name);
    if (!slug) continue;
    await db.query(
      'INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [name, slug]
    );
    const [[tag]] = await db.query('SELECT id FROM tags WHERE slug = ?', [slug]);
    if (tag) {
      await db.query(
        'INSERT IGNORE INTO posts_tags (post_id, tag_id) VALUES (?, ?)',
        [postId, tag.id]
      );
    }
  }
}

module.exports = router;
