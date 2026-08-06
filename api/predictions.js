// api/predictions.js
// Recent prediction records from the shared store (read-only).

import { configured, listPredictions } from './_store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!configured()) {
    return res.status(503).json({
      error: 'storage not configured: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    });
  }
  try {
    const { task, limit } = req.query || {};
    const rows = await listPredictions({
      task: task || undefined,
      limit: Math.min(Number(limit) || 100, 500),
    });
    return res.status(200).json({ predictions: rows });
  } catch (e) {
    console.error('predictions read failed:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
