require('dotenv').config();

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const db = require('./config/db');
const { injectUser, injectSiteData } = require('./middleware/auth');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Behind reverse proxy (Hostinger/Nginx)
app.set('trust proxy', 1);

// Body parsers
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Static
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '7d' : 0
}));

// Sessions — file-based (aman di shared hosting)
app.use(session({
  store: new FileStore({
    path: sessionsDir,
    ttl: 60 * 60 * 24 * 14, // 14 hari
    retries: 1,
    logFn: () => {} // silent
  }),
  name: 'ghost_sid',
  secret: process.env.SESSION_SECRET || 'CHANGE_ME_PLEASE',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 hari
    httpOnly: true,
    secure: IS_PROD,          // HTTPS only di production
    sameSite: 'lax'
  }
}));

// Inject data ke views
app.use(injectUser);
app.use(injectSiteData(db.getSettings));

// Theme cookie
app.use((req, res, next) => {
  res.locals.theme = req.cookies.theme === 'dark' ? 'dark' : 'light';
  next();
});

// ===== Routes =====
app.use('/', require('./routes/setup'));          // /setup (auto-disabled)
app.use('/admin', require('./routes/auth'));      // /admin/login /admin/logout
app.use('/admin', require('./routes/admin'));     // /admin dashboard + CRUD
app.use('/api', require('./routes/wp-api'));      // WP-like API (app passwords)
app.use('/', require('./routes/public'));         // public pages

// Healthcheck (cek DB & env)
app.get('/healthz', async (req, res) => {
  const out = {
    ok: true,
    time: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV || 'unset',
    db: { status: 'unknown' }
  };
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    out.db.status = rows[0].ok === 1 ? 'connected' : 'weird';
    const [users] = await db.query('SELECT COUNT(*) AS c FROM users');
    out.db.users = users[0].c;
  } catch (e) {
    out.ok = false;
    out.db.status = 'error';
    out.db.error = e.message;
    out.db.code = e.code;
  }
  res.json(out);
});

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const showDetail = !IS_PROD;
  res.status(500).send(
    `<h1>500 — Server Error</h1>` +
    (showDetail
      ? `<pre style="padding:20px;background:#fee;color:#900;overflow:auto;">${
          (err.stack || err.message || String(err)).replace(/</g, '&lt;')
        }</pre>`
      : '<p>Something went wrong. Please try again.</p>')
  );
});

// ===== Bootstrap =====
(async () => {
  try {
    console.log('[BOOT] Initializing database...');
    await db.initDatabase();
    console.log('[BOOT] Database ready.');

    app.listen(PORT, () => {
      console.log(`🚀 Ghost Clone running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Site URL:    ${process.env.SITE_URL || 'http://localhost:' + PORT}`);
      console.log(`   Setup URL:   ${process.env.SITE_URL || 'http://localhost:' + PORT}/setup`);
    });
  } catch (e) {
    console.error('[FATAL] Failed to start:', e);
    // Tetap listen agar healthz tetap jalan & user bisa lihat error di browser
    app.listen(PORT, () => {
      console.log(`⚠️  App listening on ${PORT} but DB init FAILED — check /healthz`);
    });
  }
})();
