// api/scores.js
// Live scores over resolved predictions (read-only). Hit rate with Wilson CI,
// grouped by task and cohort, mirroring selflearn_core.scoring conventions.
// Unresolved predictions are excluded; until outcomes exist this returns an
// empty list (honest, not fabricated).

import { configured, listResolved, scoreIdeas } from './_store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!configured()) {
    return res.status(503).json({
      error: 'storage not configured: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    });
  }
  try {
    const { task } = req.query || {};
    const rows = await listResolved({ task: task || undefined });
    return res.status(200).json({ scores: scoreIdeas(rows), resolved_count: rows.length });
  } catch (e) {
    console.error('scores read failed:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
