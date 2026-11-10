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

import { requireOwner } from './_auth.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!await requireOwner(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Research provider is not configured.' });

  try {
    const { system, messages, max_tokens = 1024 } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20
      || messages.some((m) => !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string')
      || (system != null && typeof system !== 'string')
      || !Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > 4096
      || JSON.stringify({ system, messages }).length > 64000) {
      return res.status(400).json({ error: 'Invalid research request.' });
    }

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens,
        ...(system ? { system } : {}),
        messages,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(45000),
    });

    const j = await r.json();
    if (!r.ok) {
      return res.status(r.status === 429 ? 429 : 502).json({ error: 'Research provider is temporarily unavailable.' });
    }
    return res.status(200).json(j);
  } catch (e) {
    return res.status(502).json({ error: 'Research provider is temporarily unavailable.' });
  }
}
