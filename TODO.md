# TODO - Paket B (WP API + App Password + AI Translate + Video Player)

- [x] Add DB table: application_passwords
- [x] Add AI title translate helper (OpenAI -> Gemini -> Grok fallback)
- [x] Add Basic Auth middleware for application password
- [x] Add WP-compatible API route: POST /api/wp/v2/posts
- [x] Mount wp-api route in server.js
- [x] Add admin routes for app password management
- [x] Add admin page: app-passwords.ejs
- [x] Add nav link to App Passwords in admin nav
- [x] Add MP4/HLS player support in single post view
- [ ] Thorough testing (UI + API + edge cases) and fix findings
