# Ghost Clone — Lightweight Microblog

Ghost-inspired microblog untuk Hostinger Node.js (atau hosting Node manapun). Dibuat ringan, no native deps, dan fokus pada reliability di shared hosting.

## ✨ Fitur

- 📝 **Markdown editor** dengan toolbar, auto-save draft (localStorage), Ctrl+S save
- 🔐 **Setup wizard** (`/setup`) — auto-disabled setelah user pertama dibuat
- 🗂 **File-based session** — TIDAK pakai MySQL store (lebih stabil di Hostinger)
- 🌓 **Dark/Light theme** toggle (cookie-based)
- 🏷 **Tags** + halaman tag + tag cloud
- ⭐ **Featured post** (tampil besar di homepage)
- 🔍 **Search**, pagination
- 📡 **RSS, Sitemap, robots.txt** auto-generate
- 🖼 **Feature image via URL** (external, no upload — hemat storage)
- 🎨 **Ghost-inspired design** dengan accent red `#ff3b3b`
- 🩺 **Healthcheck** `/healthz` — cek koneksi DB & env
- 🔒 **bcryptjs** (pure JS, no native compile — aman Hostinger)
- 🚫 **No comments** — fokus pada konten
- ⚡ **Auto-create tables** saat boot, tidak perlu import SQL manual

## 🚀 Instalasi

### 1. Setup lokal

```bash
cd ghost-clone
cp .env.example .env
# edit .env — isi DB credentials & SESSION_SECRET
npm install
npm start
```

Buka `http://localhost:3000/setup` untuk buat admin pertama.

### 2. Deploy ke Hostinger

1. Di **hPanel → Node.js**, buat aplikasi:
   - **Node version**: 18+ (direkomendasikan 20)
   - **Application root**: `public_html/app` (atau sesuai)
   - **Application URL**: domain kamu
   - **Application startup file**: `server.js`

2. **Upload** semua file (via FTP/File Manager/Git).

3. **Set environment variables** di hPanel:
   ```
   DB_HOST=localhost
   DB_USER=u563981535_iexist
   DB_PASSWORD=your-password
   DB_NAME=u563981535_iexist
   SESSION_SECRET=random-50-char-string
   SITE_TITLE=My Blog
   SITE_URL=https://yourdomain.com
   NODE_ENV=production
   ```

4. Klik **Run NPM Install**.

5. **Start / Restart** aplikasi.

6. Buka `https://yourdomain.com/setup` → buat admin.

7. Buka `https://yourdomain.com/healthz` untuk verify.

### 3. Cek `/healthz`

Response JSON:
```json
{
  "ok": true,
  "db": { "status": "connected", "users": 1 }
}
```

Kalau `ok: false`, cek `db.error` — biasanya env vars salah.

## 📁 Struktur

```
ghost-clone/
├── server.js             # Express bootstrap (entry point)
├── config/db.js          # DB pool + auto-migrate + helpers
├── middleware/auth.js    # requireAuth, injectUser, injectSiteData
├── routes/
│   ├── setup.js          # /setup wizard (auto-disable)
│   ├── auth.js           # /admin/login, /admin/logout
│   ├── admin.js          # /admin CRUD (posts, dashboard)
│   └── public.js         # /, /post/:slug, /tag/:slug, /rss.xml, /sitemap.xml
├── utils/
│   ├── markdown.js       # marked + DOMPurify + hljs
│   └── helpers.js        # slugify, readingTime, formatDate, parseTags, ...
├── views/
│   ├── 404.ejs
│   ├── public/           # _header, _footer, home, post, tag
│   └── admin/            # _nav, login, setup, dashboard, posts, editor
├── public/
│   ├── css/              # ghost.css (public), admin.css
│   ├── js/editor.js      # markdown toolbar + auto-save
│   └── uploads/          # reserved (external URL dipakai, no local upload)
├── sessions/             # file-based session store (gitignored)
└── package.json
```

## 🔧 Settings

Editable via code/DB (table `settings`):

| key | default | keterangan |
|---|---|---|
| `site_title` | "My Blog" | Judul situs |
| `site_description` | "A microblog" | Meta description |
| `posts_per_page` | `10` | Pagination homepage |
| `show_featured` | `1` | Tampilkan featured hero |

## ⚠️ Kenapa bukan blog-pro?

Blog-pro punya beberapa masalah di Hostinger:
- 🚫 **express-mysql-session** sering error di shared hosting (connection dropped)
- 🚫 **sharp** & **bcrypt** punya native deps yang gagal compile di Hostinger
- 🚫 **File upload lokal** boros storage, ribet permission
- 🚫 Tidak ada healthcheck → hard to debug env issue

Ghost-clone fix semua itu:
- ✅ **session-file-store** — 100% JS, no DB dependency
- ✅ **bcryptjs + no sharp** — pure JS, no native compile
- ✅ **External image URL** — upload ke Cloudinary/Imgur, paste URL
- ✅ **`/healthz` endpoint** — one-glance diagnostic

## 🎨 Customize

- **Accent color**: edit `ACCENT_COLOR` di `.env`, atau edit `--accent` di `public/css/ghost.css`.
- **Font**: edit `--font-serif` di `ghost.css`.
- **Layout**: semua EJS ada di `views/`.

## 📝 Lisensi

MIT
