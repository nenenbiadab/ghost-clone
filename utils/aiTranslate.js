const fetch = require('node-fetch');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-2-latest';

function cleanTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function buildPrompt(input) {
  return [
    'Terjemahkan judul berikut ke Bahasa Indonesia yang natural untuk konten web.',
    'Aturan:',
    '- Pertahankan makna inti.',
    '- Jangan tambahkan kalimat lain.',
    '- Output hanya judul hasil terjemahan saja.',
    `Judul: ${input}`
  ].join('\n');
}

async function translateWithOpenAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a concise title translator.' },
        { role: 'user', content: buildPrompt(input) }
      ]
    }),
    timeout: 15000
  });

  if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
  const data = await resp.json();
  return cleanTitle(data?.choices?.[0]?.message?.content || '');
}

async function translateWithGemini(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { temperature: 0.2 }
    }),
    timeout: 15000
  });

  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join(' ') || '';
  return cleanTitle(text);
}

async function translateWithGrok(input) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY missing');

  const base = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';
  const resp = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a concise title translator.' },
        { role: 'user', content: buildPrompt(input) }
      ]
    }),
    timeout: 15000
  });

  if (!resp.ok) throw new Error(`Grok HTTP ${resp.status}`);
  const data = await resp.json();
  return cleanTitle(data?.choices?.[0]?.message?.content || '');
}

async function translateTitleToIndonesian(rawTitle) {
  const input = cleanTitle(rawTitle);
  if (!input) return { title: '', provider: 'none', fallback: true };

  const providers = [
    { name: 'openai', fn: translateWithOpenAI },
    { name: 'gemini', fn: translateWithGemini },
    { name: 'grok', fn: translateWithGrok }
  ];

  for (const p of providers) {
    try {
      const out = await p.fn(input);
      if (out) return { title: out, provider: p.name, fallback: false };
    } catch (_e) {}
  }

  return { title: input, provider: 'original', fallback: true };
}

module.exports = { translateTitleToIndonesian };
