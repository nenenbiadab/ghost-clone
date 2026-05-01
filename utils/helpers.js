const slugify = require('slugify');

/**
 * Buat slug unik dari text.
 * Kalau dipanggil tanpa cekDb, bisa tabrakan di DB — caller harus handle.
 */
exports.makeSlug = (text) => {
  return slugify(text || '', { lower: true, strict: true, trim: true });
};

/**
 * Slug dengan suffix timestamp biar hampir pasti unik
 */
exports.makeUniqueSlug = (text) => {
  const base = exports.makeSlug(text);
  const suffix = Date.now().toString(36);
  return base ? `${base}-${suffix}` : suffix;
};

/**
 * Estimasi waktu baca (menit) berdasarkan jumlah kata.
 */
exports.readingTime = (text) => {
  if (!text) return 1;
  const words = text.replace(/[#*`_~>]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
};

/**
 * Format tanggal ke bahasa Indonesia
 */
exports.formatDate = (date) => {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '';
  }
};

/**
 * Format date ke ISO8601 untuk meta/schema
 */
exports.formatISO = (date) => {
  if (!date) return '';
  try {
    return new Date(date).toISOString();
  } catch {
    return '';
  }
};

/**
 * Escape HTML (untuk output yang tidak perlu markdown)
 */
exports.escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Fallback feature image placeholder kalau post tidak punya cover
 */
exports.getFeatureImage = (post) => {
  if (post && post.feature_image) return post.feature_image;
  const text = encodeURIComponent(((post && post.title) || 'Untitled').substring(0, 40));
  return `https://placehold.co/1200x630/1a1a1a/ffffff?text=${text}`;
};

/**
 * Parse tags string "tag1, tag2, tag3" -> array
 */
exports.parseTags = (str) => {
  if (!str) return [];
  return str
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20); // max 20 tags
};
