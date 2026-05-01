const bcrypt = require('bcryptjs');
const db = require('../config/db');

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  const b64 = header.slice(6).trim();
  let plain = '';
  try {
    plain = Buffer.from(b64, 'base64').toString('utf8');
  } catch (_e) {
    return null;
  }
  const idx = plain.indexOf(':');
  if (idx < 0) return null;
  return {
    username: plain.slice(0, idx),
    password: plain.slice(idx + 1)
  };
}

async function appPasswordAuth(req, res, next) {
  try {
    const auth = parseBasicAuth(req.headers.authorization || '');
    if (!auth || !auth.username || !auth.password) {
      return res.status(401).json({ code: 'unauthorized', message: 'Missing Basic Auth' });
    }

    const [users] = await db.query(
      'SELECT id, email, name FROM users WHERE email = ? OR name = ? LIMIT 1',
      [auth.username, auth.username]
    );
    if (!users.length) {
      return res.status(401).json({ code: 'unauthorized', message: 'Invalid credentials' });
    }

    const user = users[0];
    const [keys] = await db.query(
      `SELECT id, password_hash
       FROM application_passwords
       WHERE user_id = ? AND revoked_at IS NULL`,
      [user.id]
    );

    let matchedKeyId = null;
    for (const k of keys) {
      const ok = await bcrypt.compare(auth.password, k.password_hash);
      if (ok) {
        matchedKeyId = k.id;
        break;
      }
    }

    if (!matchedKeyId) {
      return res.status(401).json({ code: 'unauthorized', message: 'Invalid credentials' });
    }

    await db.query(
      'UPDATE application_passwords SET last_used_at = NOW() WHERE id = ?',
      [matchedKeyId]
    );

    req.apiUser = { id: user.id, email: user.email, name: user.name };
    req.appPasswordId = matchedKeyId;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { appPasswordAuth };
