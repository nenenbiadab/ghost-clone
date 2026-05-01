/**
 * Ghost Clone — Markdown editor helpers
 * Simple toolbar untuk insert markdown syntax & auto-save draft ke localStorage.
 */
(function () {
  const textarea = document.getElementById('md-textarea');
  if (!textarea) return;

  const form = textarea.closest('form');
  const postId = form && form.dataset.postId;
  const storageKey = `draft:${postId || 'new'}`;

  // ===== Toolbar actions =====
  function wrap(before, after = '') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = before + selected + (after || before);
    textarea.setRangeText(replacement, start, end, 'select');
    textarea.focus();
  }

  function prefix(str) {
    const start = textarea.selectionStart;
    const before = textarea.value.substring(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    textarea.setRangeText(str, lineStart, lineStart, 'end');
    textarea.focus();
  }

  const toolbar = document.getElementById('md-toolbar');
  if (toolbar) {
    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('button[data-md]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.md;
      switch (action) {
        case 'bold':   wrap('**'); break;
        case 'italic': wrap('_'); break;
        case 'code':   wrap('`'); break;
        case 'link':   wrap('[', '](https://)'); break;
        case 'image':  wrap('![alt](', ')'); break;
        case 'h2':     prefix('## '); break;
        case 'h3':     prefix('### '); break;
        case 'quote':  prefix('> '); break;
        case 'ul':     prefix('- '); break;
        case 'ol':     prefix('1. '); break;
        case 'hr':     textarea.setRangeText('\n\n---\n\n', textarea.selectionStart, textarea.selectionEnd, 'end'); break;
        case 'codeblock':
          wrap('```\n', '\n```');
          break;
      }
    });
  }

  // ===== Auto-save to localStorage =====
  let saveTimer;
  const titleInput = document.getElementById('title-input');
  const statusEl = document.getElementById('save-status');

  function doSave() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        title: titleInput ? titleInput.value : '',
        markdown: textarea.value,
        savedAt: Date.now()
      }));
      if (statusEl) {
        statusEl.textContent = '✓ Draft saved locally';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
      }
    } catch (e) { /* quota exceeded atau incognito */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 800);
  }

  textarea.addEventListener('input', scheduleSave);
  if (titleInput) titleInput.addEventListener('input', scheduleSave);

  // Restore draft kalau ada (hanya untuk new post)
  if (!postId) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && (saved.title || saved.markdown)) {
        const restore = confirm('Ada draft yang belum tersimpan. Pulihkan?');
        if (restore) {
          if (titleInput && saved.title) titleInput.value = saved.title;
          if (saved.markdown) textarea.value = saved.markdown;
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Clear draft after submit
  if (form) {
    form.addEventListener('submit', () => {
      try { localStorage.removeItem(storageKey); } catch (e) {}
    });
  }

  // Cmd/Ctrl+S to save form
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (form) form.submit();
    }
  });

  // Tab indent
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.setRangeText('  ', start, end, 'end');
    }
  });
})();

// ===== Theme toggle =====
(function () {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      await fetch('/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next })
      });
    } catch (e) {}
  });
})();
