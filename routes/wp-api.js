const express = require('express');
const router = express.Router();
const db = require('../config/db');
const markdown = require('../utils/markdown');
const helpers = require('../utils/helpers');
const { appPasswordAuth } = require('../middleware/appPasswordAuth');
const { translateTitleToIndonesian } = require('../utils/aiTranslate');

function toArrayTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(v => String(v).trim()).filter(Boolean);
  if (typeof input === 'string') return helpers.parseTags(input);
  return [];
}

function mapStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'publish' || v === 'published') return 'published';
  if (v === 'draft' || v === 'pending') return 'draft';
  if (v === 'future' || v === 'scheduled') return 'scheduled';
  return 'draft';
}

async function ensureUniqueSlug(baseTitle) {
  const base = helpers.makeSlug(baseTitle) || `post-${Date.now()}`;
  let slug = base;
  let n = 2;
  while (true) {
    const [rows] = await db.query('SELECT id FROM posts WHERE slug = ? LIMIT 1', [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${n++}`;
  }
}

async function syncTags(postId, tagsInput) {
  const tagNames = toArrayTags(tagsInput);
  await db.query('DELETE FROM posts_tags WHERE post_id = ?', [postId]);

  for (const nameRaw of tagNames) {
    const name = String(nameRaw).trim();
    if (!name) continue;
    const slug = helpers.makeSlug(name);
    if (!slug) continue;

    await db.query(
      'INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [name, slug]
    );

    const [[tag]] = await db.query('SELECT id FROM tags WHERE slug = ? LIMIT 1', [slug]);
    if (tag) {
      await db.query(
        'INSERT IGNORE INTO posts_tags (post_id, tag_id) VALUES (?, ?)',
        [postId, tag.id]
      );
    }
  }
}

router.post('/wp/v2/posts', appPasswordAuth, async (req, res, next) => {
  try {
    const payload = req.body || {};

    const rawTitle = typeof payload.title === 'string'
      ? payload.title
      : (payload.title && payload.title.rendered) || '';

    if (!rawTitle || !rawTitle.trim()) {
      return res.status(400).json({ code: 'invalid_title', message: 'title is required' });
    }

    const autoTranslate = String(payload.auto_translate_title || '').toLowerCase() === 'true' || payload.auto_translate_title === true;
    let title = rawTitle.trim();
    let translation = { provider: 'none', fallback: false };

    if (autoTranslate) {
      const tr = await translateTitleToIndonesian(title);
      if (tr.title) title = tr.title;
      translation = { provider: tr.provider, fallback: tr.fallback };
    }

    const content = typeof payload.content === 'string'
      ? payload.content
      : (payload.content && payload.content.raw) || '';

    const excerptInput = typeof payload.excerpt === 'string'
      ? payload.excerpt
      : (payload.excerpt && payload.excerpt.raw) || '';

    const status = mapStatus(payload.status);
    const visibility = 'public';
    const slug = payload.slug ? helpers.makeSlug(String(payload.slug)) : await ensureUniqueSlug(title);
    const html = content || '';
    const mdText = content || '';
    const excerpt = excerptInput || markdown.makeExcerpt(mdText, 200);
    const featureImage = payload.featured_media_url || payload.feature_image || payload?.meta?.eroz_meta_src || null;
    const videoUrl = payload?.meta?.video_url || payload.video_url || null;
    const publishedAt = status === 'published' ? new Date() : null;

    const [result] = await db.query(
      `INSERT INTO posts
       (title, slug, markdown, html, excerpt, feature_image, status, visibility, featured, author_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        slug,
        mdText,
        html,
        excerpt,
        featureImage,
        status,
        visibility,
        0,
        req.apiUser.id,
        publishedAt
      ]
    );

    if (videoUrl) {
      try {
        await db.query(
          'UPDATE posts SET video_url = ?, meta_description = COALESCE(meta_description, ?) WHERE id = ?',
          [videoUrl, `video_url:${videoUrl}`, result.insertId]
        );
      } catch (err) {
        const msg = String(err && err.message ? err.message : '');
        if (msg.toLowerCase().includes('unknown column') && msg.toLowerCase().includes('video_url')) {
          await db.query(
            'UPDATE posts SET meta_description = COALESCE(meta_description, ?) WHERE id = ?',
            [`video_url:${videoUrl}`, result.insertId]
          );
        } else {
          throw err;
        }
      }
    }

    await syncTags(result.insertId, payload.tags);

    const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({
      id: result.insertId,
      title,
      slug,
      status,
      link: `${siteUrl}/post/${slug}`,
      author: req.apiUser.email,
      translation
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
