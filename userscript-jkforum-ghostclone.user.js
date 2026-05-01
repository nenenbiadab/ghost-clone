// ==UserScript==
// @name         JKForum - Post Video ke GhostClone API
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Ringan + Auto Translate Judul + Kirim ke /api/wp/v2/posts (GhostClone compatible)
// @author       Oppie
// @match        https://jkforum.net/*
// @grant        GM_xmlhttpRequest
// @connect      jkforum.net
// @connect      translate.googleapis.com
// @connect      cyberknife.in
// @connect      cdn1.mymyatt.net
// @connect      cdn2.mymyatt.net
// @connect      cdn3.mymyatt.net
// @connect      cdn4.mymyatt.net
// @connect      cdn5.mymyatt.net
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    baseURL: "https://jkforum.net",
    apiBaseUrl: "https://cyberknife.in",
    apiUsername: "admin",
    apiAppPassword: "rfdchv-5g2tbw-mol0ciaz",
    defaultTags: ["Jablay", "Video"]
  };

  function getByXPath(xpath) {
    const results = [];
    try {
      const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < snapshot.snapshotLength; i++) results.push(snapshot.snapshotItem(i));
    } catch (_e) {}
    return results;
  }

  function fixURL(src) {
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return CONFIG.baseURL + (src.startsWith("/") ? src : "/" + src);
  }

  function resolveRedirect(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 12000,
        onload: (res) => resolve(res.finalUrl || url),
        onerror: () => resolve(url),
        ontimeout: () => resolve(url)
      });
    });
  }

  async function translateTitle(title) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=id&dt=t&q=${encodeURIComponent(title)}`,
        timeout: 8000,
        onload: (res) => {
          try {
            const json = JSON.parse(res.responseText);
            resolve(json[0].map(item => item[0]).join("").trim() || title);
          } catch (_e) {
            resolve(title);
          }
        },
        onerror: () => resolve(title),
        ontimeout: () => resolve(title)
      });
    });
  }

  function makeToast(msg, color = "#a6e3a1", ms = 4000) {
    const old = document.getElementById("wp-toast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.id = "wp-toast";
    t.textContent = msg;
    t.style.cssText = `position:fixed;right:25px;bottom:25px;background:${color};color:#111;padding:14px 22px;border-radius:999px;font-weight:bold;box-shadow:0 5px 20px rgba(0,0,0,0.4);z-index:2147483647;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function isBadImageCandidate(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    return (
      u.includes('/images/av.svg') ||
      u.includes('/images/credits/') ||
      u.includes('badge') ||
      u.includes('avatar') ||
      u.includes('default') ||
      u.includes('placeholder') ||
      u.endsWith('.svg')
    );
  }

  async function pickBestImageUrl() {
    // Prioritaskan pola lama script WP: //p/img/@src
    const prioritized = getByXPath("//p/img/@src");
    // fallback luas bila struktur berubah
    const fallback = getByXPath("//article//img/@src|//main//img/@src|//img/@src");
    const all = [...prioritized, ...fallback];

    for (const node of all) {
      const raw = (node.value || node.textContent || "").trim();
      if (!raw) continue;
      const fixed = fixURL(raw);
      if (!fixed || isBadImageCandidate(fixed)) continue;

      const finalUrl = await resolveRedirect(fixed);
      if (!finalUrl || isBadImageCandidate(finalUrl)) continue;

      return finalUrl;
    }
    return null;
  }

  async function pickBestVideoUrl() {
    const vidNodes = getByXPath("//video/source/@src|//source[@type='video/mp4']/@src|//a[contains(@href,'.m3u8')]/@href|//a[contains(@href,'.mp4')]/@href");
    if (!vidNodes.length) return null;

    // ambil kandidat terakhir seperti script lama
    const raw = (vidNodes[vidNodes.length - 1].value || vidNodes[vidNodes.length - 1].textContent || "").trim();
    if (!raw) return null;

    return await resolveRedirect(fixURL(raw));
  }

  async function extractMediaUrls() {
    const [imageUrl, videoUrl] = await Promise.all([
      pickBestImageUrl(),
      pickBestVideoUrl()
    ]);
    return { imageUrl, videoUrl };
  }

  function sendPost(payload) {
    return new Promise((resolve, reject) => {
      const token = btoa(`${CONFIG.apiUsername}:${CONFIG.apiAppPassword}`);
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.apiBaseUrl}/api/wp/v2/posts`,
        headers: {
          "Authorization": `Basic ${token}`,
          "Content-Type": "application/json"
        },
        data: JSON.stringify(payload),
        timeout: 20000,
        onload: (res) => {
          const ok = res.status >= 200 && res.status < 300;
          if (!ok) return reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
          try {
            resolve(JSON.parse(res.responseText));
          } catch (_e) {
            resolve({ raw: res.responseText });
          }
        },
        onerror: () => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Request timeout"))
      });
    });
  }

  async function postToGhostClone() {
    try {
      const titleNode = getByXPath("//h1")[0];
      const rawTitle = titleNode ? titleNode.textContent.trim() : document.title;
      const cleanTitle = rawTitle.replace(/^\s*\[.*?\]\s*/, "").trim();

      makeToast("🌐 Menerjemahkan judul...", "#3b82f6", 1500);
      const translatedTitle = await translateTitle(cleanTitle);

      makeToast("🔎 Mengambil media...", "#3b82f6", 1500);
      const { imageUrl, videoUrl } = await extractMediaUrls();

      if (!videoUrl) {
        return makeToast("❌ Video tidak ditemukan", "#ef4444", 5000);
      }

      const content = `
        <p style="text-align:center; font-size:24px; margin:60px 0 40px 0; font-weight:bold;">
          Download ${translatedTitle}
        </p>
        <p style="text-align:center; font-size:17px; margin-bottom:50px; color:#555;">
          Video Lengkap
        </p>
        <div style="text-align:center; margin:50px 0;">
          <a href="https://t.me/USERNAMEKAMU" target="_blank"
             style="display:inline-block; background:#229ed9; color:white; padding:16px 36px; margin:8px;
                    font-size:17px; font-weight:bold; border-radius:50px; text-decoration:none; box-shadow:0 6px 20px rgba(34,158,217,0.4);">
            💬 Telegram
          </a>
          <a href="${videoUrl}" target="_blank"
             style="display:inline-block; background:#22c55e; color:white; padding:16px 36px; margin:8px;
                    font-size:17px; font-weight:bold; border-radius:50px; text-decoration:none; box-shadow:0 6px 20px rgba(34,197,94,0.4);">
            ⬇️ Download Full Video
          </a>
        </div>
      `;

      const postData = {
        title: translatedTitle,
        content,
        excerpt: `Download ${translatedTitle} Full Video`,
        status: "publish",
        tags: CONFIG.defaultTags,
        featured_media_url: imageUrl || "",
        auto_translate_title: false,
        video_url: videoUrl || "",
        meta: {
          eroz_meta_src: imageUrl || "",
          video_url: videoUrl || ""
        }
      };

      makeToast("⏳ Mengirim ke GhostClone...", "#3b82f6");
      const result = await sendPost(postData);
      console.log("[GhostClone API] success:", result);
      makeToast("✅ BERHASIL DIPOST!", "#22c55e", 8000);
    } catch (err) {
      console.error("[GhostClone API] failed:", err);
      makeToast("❌ Gagal post: " + err.message, "#ef4444", 7000);
    }
  }

  function createButton() {
    if (document.getElementById("wp-video-btn")) return;
    const btn = document.createElement("button");
    btn.id = "wp-video-btn";
    btn.innerHTML = `📤 POST VIDEO <br><small style="font-size:9px">GhostClone API</small>`;
    btn.style.cssText = `position:fixed;bottom:30px;right:30px;z-index:2147483647;background:#ef4444;color:white;border:none;border-radius:999px;padding:14px 24px;font-weight:bold;cursor:pointer;box-shadow:0 6px 25px rgba(0,0,0,0.5);`;
    btn.onclick = postToGhostClone;
    document.body.appendChild(btn);
  }

  window.addEventListener("load", createButton);
})();
