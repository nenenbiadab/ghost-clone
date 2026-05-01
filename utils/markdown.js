const { marked } = require('marked');
const hljs = require('highlight.js');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Setup DOMPurify sekali (JSDOM window reusable)
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// ===== Custom renderer — compatible marked 9.x =====
const renderer = new marked.Renderer();

// Simpan renderer default untuk fallback
const defaultCode = renderer.code.bind(renderer);
const defaultLink = renderer.link.bind(renderer);
const defaultImage = renderer.image.bind(renderer);

renderer.code = function (code, lang, escaped) {
  try {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(String(code || ''), {
      language,
      ignoreIllegals: true
    }).value;
    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>\n`;
  } catch (e) {
    // Kalau hljs gagal, fallback ke default rendering
    return defaultCode(code, lang, escaped);
  }
};

renderer.link = function (href, title, text) {
  try {
    const url = String(href || '');
    const isExternal = /^https?:\/\//i.test(url);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
    return `<a href="${url}"${titleAttr}${attrs}>${text}</a>`;
  } catch (e) {
    return defaultLink(href, title, text);
  }
};

renderer.image = function (href, title, text) {
  try {
    const url = String(href || '');
    const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
    const altAttr = text ? ` alt="${String(text).replace(/"/g, '&quot;')}"` : '';
    const caption = text ? `<figcaption>${text}</figcaption>` : '';
    return `<figure><img src="${url}"${altAttr}${titleAttr} loading="lazy">${caption}</figure>`;
  } catch (e) {
    return defaultImage(href, title, text);
  }
};

marked.setOptions({
  renderer,
  breaks: true,
  gfm: true,
  headerIds: true,
  mangle: false,
  // async: false — explicit sync, biar return string langsung
});

/**
 * Render markdown -> sanitized HTML.
 * Safe: kalau marked / purify gagal, return plain-escaped text
 * sehingga request tidak crash.
 */
exports.render = (text) => {
  if (!text) return '';
  try {
    const html = marked.parse(String(text));
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel', 'class', 'loading', 'id'],
      ADD_TAGS: ['iframe', 'video', 'source', 'audio', 'figure', 'figcaption'],
      ALLOW_UNKNOWN_PROTOCOLS: false
    });
  } catch (e) {
    console.error('[markdown.render] FAIL:', e.message);
    // Fallback: escape & wrap di <pre>, biar data post tidak hilang
    const esc = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre>${esc}</pre>`;
  }
};

/**
 * Bersihkan markdown jadi plain text (untuk excerpt / meta description)
 */
exports.stripMarkdown = (text) => {
  if (!text) return '';
  try {
    return String(text)
      .replace(/```[\s\S]*?```/g, '')               // code block
      .replace(/`([^`]+)`/g, '$1')                  // inline code
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')         // images
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // links -> text
      .replace(/^#{1,6}\s+/gm, '')                  // headings
      .replace(/^\s*[-*+>]\s+/gm, '')               // list/quote markers
      .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // bold/italic
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    return String(text);
  }
};

/**
 * Auto-generate excerpt dari markdown (max N chars)
 */
exports.makeExcerpt = (markdown, maxLen = 200) => {
  const plain = exports.stripMarkdown(markdown);
  if (plain.length <= maxLen) return plain;
  return plain.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
};
