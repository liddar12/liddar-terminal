// api/claude.js
// Minimal serverless proxy to the Anthropic Messages API. Keeps the API key
// server-side so the browser never sees it. Same Vercel function pattern as
// api/breadth.js.
//
// POST /api/claude
// body: { messages: [{role, content}], system?, model?, max_tokens? }
// 200 -> the raw Anthropic Messages response ({ content: [{type, text}], ... })
// 4xx/5xx -> { error }
//
// Env: ANTHROPIC_API_KEY (required), CLAUDE_MODEL (optional default).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const { system, messages, model, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] required' });
    }

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: max_tokens || 1024,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const j = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: j?.error?.message || `Anthropic HTTP ${r.status}` });
    }
    return res.status(200).json(j);
  } catch (e) {
    console.error('claude proxy failed:', e.message);
    return res.status(502).json({ error: `claude proxy failed: ${e.message}` });
  }
}
