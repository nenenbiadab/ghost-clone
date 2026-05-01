const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const router = express.Router();

/**
 * Setup wizard — one-time.
 * Otomatis DISABLED kalau sudah ada user DI DB, atau kalau env DISABLE_SETUP=true.
 */

async function setupAllowed() {
  if (String(process.env.DISABLE_SETUP).toLowerCase() === 'true') return false;
  try {
    const exists = await db.hasAnyUser();
    return !exists;
  } catch (e) {
    // Kalau DB error — izinkan akses halaman setup supaya user lihat error dengan jelas
    return true;
  }
}

router.get('/setup', async (req, res) => {
  const allowed = await setupAllowed();
  if (!allowed) {
    return res.status(403).render('admin/setup', {
      locked: true,
      error: 'Setup sudah selesai. Route ini dinonaktifkan karena sudah ada user.',
      values: { email: '', name: '' }
    });
  }

  // Cek koneksi DB dulu supaya user dapat feedback jelas
  let dbStatus = { ok: true, msg: 'OK' };
  try {
    await db.query('SELECT 1');
  } catch (e) {
    dbStatus = { ok: false, msg: e.message, code: e.code };
  }

  res.render('admin/setup', {
    locked: false,
    error: null,
    dbStatus,
    values: { email: '', name: '' }
  });
});

router.post('/setup', async (req, res) => {
  const allowed = await setupAllowed();
  if (!allowed) {
    return res.status(403).render('admin/setup', {
      locked: true,
      error: 'Setup sudah dilakukan sebelumnya.',
      values: { email: '', name: '' }
    });
  }

  const { email, name, password, password_confirm } = req.body;

  // Validasi
  const errors = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email tidak valid');
  if (!name || name.trim().length < 2) errors.push('Nama minimal 2 karakter');
  if (!password || password.length < 8) errors.push('Password minimal 8 karakter');
  if (password !== password_confirm) errors.push('Konfirmasi password tidak cocok');

  if (errors.length) {
    return res.render('admin/setup', {
      locked: false,
      error: errors.join(', '),
      dbStatus: { ok: true, msg: 'OK' },
      values: { email: email || '', name: name || '' }
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email.trim().toLowerCase(), hash, name.trim()]
    );

    // Auto-login
    req.session.user = {
      id: result.insertId,
      email: email.trim().toLowerCase(),
      name: name.trim()
    };

    req.session.save(() => res.redirect('/admin'));
  } catch (e) {
    console.error('[SETUP]', e);
    res.render('admin/setup', {
      locked: false,
      error: 'Gagal membuat admin: ' + e.message,
      dbStatus: { ok: false, msg: e.message, code: e.code },
      values: { email, name }
    });
  }
});

module.exports = router;
