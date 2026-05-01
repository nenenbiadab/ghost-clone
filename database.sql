-- ==========================================
-- Ghost Clone — Database Schema
-- ==========================================
-- NOTE: Tabel-tabel ini juga AUTO-DIBUAT oleh server.js saat pertama jalan.
-- File ini disediakan sebagai referensi / backup.
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  bio TEXT,
  avatar VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts (
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
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_slug (slug),
  INDEX idx_featured (featured),
  INDEX idx_published (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  slug VARCHAR(80) UNIQUE NOT NULL,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts_tags (
  post_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(80) PRIMARY KEY,
  value TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default settings (optional — bisa di-override via admin panel nanti)
INSERT IGNORE INTO settings (`key`, value) VALUES
  ('site_title', 'iExist'),
  ('site_description', 'Microblog personal'),
  ('posts_per_page', '10'),
  ('show_featured', '1');
