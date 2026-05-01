const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: false
});

/**
 * Auto-create tables kalau belum ada.
 * Dipanggil sekali saat server startup.
 */
async function initDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(150) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      avatar VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      markdown LONGTEXT,
      html LONGTEXT,
      excerpt TEXT,
      feature_image VARCHAR(500),
      status ENUM('published','draft','scheduled') DEFAULT 'draft',
      visibility ENUM('public','private') DEFAULT 'public',
      featured TINYINT(1) DEFAULT 0,
      views INT DEFAULT 0,
      meta_title VARCHAR(255),
      meta_description TEXT,
      author_id INT,
      published_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_slug (slug),
      INDEX idx_featured (featured),
      INDEX idx_published (published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) UNIQUE NOT NULL,
      slug VARCHAR(80) UNIQUE NOT NULL,
      description TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS posts_tags (
      post_id INT NOT NULL,
      tag_id INT NOT NULL,
      PRIMARY KEY (post_id, tag_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(80) PRIMARY KEY,
      value TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS application_passwords (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      last_used_at TIMESTAMP NULL,
      revoked_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_app_user (user_id),
      INDEX idx_app_revoked (revoked_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }

  // Default settings — insert kalau belum ada
  await pool.query(
    `INSERT IGNORE INTO settings (\`key\`, value) VALUES
      ('site_title', ?),
      ('site_description', ?),
      ('posts_per_page', '10'),
      ('show_featured', '1')`,
    [
      process.env.SITE_TITLE || 'My Blog',
      process.env.SITE_DESCRIPTION || 'A microblog'
    ]
  );
}

/**
 * Cek apakah sudah ada user (admin).
 * Dipakai untuk disable /setup route otomatis.
 */
async function hasAnyUser() {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM users');
  return rows[0].c > 0;
}

/**
 * Ambil semua settings sebagai object { key: value }
 */
async function getSettings() {
  const [rows] = await pool.query('SELECT `key`, value FROM settings');
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}

module.exports = {
  pool,
  query: (...args) => pool.query(...args),
  initDatabase,
  hasAnyUser,
  getSettings
};
