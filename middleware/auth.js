/**
 * Middleware otentikasi & session helpers.
 */

exports.requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  // Simpan tujuan awal biar bisa redirect balik setelah login
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
};

exports.redirectIfAuth = (req, res, next) => {
  if (req.session && req.session.user) return res.redirect('/admin');
  next();
};

exports.injectUser = (req, res, next) => {
  res.locals.currentUser = (req.session && req.session.user) || null;
  next();
};

exports.injectSiteData = (getSettings) => async (req, res, next) => {
  try {
    res.locals.site = await getSettings();
    res.locals.siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    res.locals.accentColor = process.env.ACCENT_COLOR || '#ff3b3b';
    next();
  } catch (e) {
    // Kalau DB error, jangan crash total — fallback ke default
    res.locals.site = {
      site_title: process.env.SITE_TITLE || 'Blog',
      site_description: process.env.SITE_DESCRIPTION || ''
    };
    res.locals.siteUrl = process.env.SITE_URL || '';
    res.locals.accentColor = process.env.ACCENT_COLOR || '#ff3b3b';
    next();
  }
};
