const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { redirectIfAuth } = require('../middleware/auth');
const router = express.Router();

// ===== LOGIN =====
router.get('/login', redirectIfAuth, async (req, res) => {
  // Kalau belum ada user sama sekali → arahkan ke setup
  try {
    const hasUser = await db.hasAnyUser();
    if (!hasUser) return res.redirect('/setup');
  } catch (e) { /* biarin, biar user lihat error di login kalau DB mati */ }

  res.render('admin/login', { error: null, email: '' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('admin/login', { error: 'Email dan password wajib diisi', email: email || '' });
  }

  try {
    const [users] = await db.query(
      'SELECT id, email, password, name FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.render('admin/login', { error: 'Email atau password salah', email });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render('admin/login', { error: 'Email atau password salah', email });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name
    };

    const returnTo = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    req.session.save(() => res.redirect(returnTo));
  } catch (e) {
    console.error('[LOGIN]', e);
    res.render('admin/login', { error: 'Server error: ' + e.message, email });
  }
});

// ===== LOGOUT =====
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ghost_sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
