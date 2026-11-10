// api/predictions.js
// Recent prediction records from the shared store (read-only).

import { configured, listPredictions } from './_store.js';
import { requireOwner } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!await requireOwner(req, res)) return;
  if (!configured()) {
    return res.status(503).json({
      error: 'Storage is not configured.',
    });
  }
  try {
    const { task, limit } = req.query || {};
    if (task != null && (typeof task !== 'string' || task.length > 200)) return res.status(400).json({ error: 'Invalid task.' });
    const count = limit == null ? 100 : Number(limit);
    if (!Number.isInteger(count) || count < 1 || count > 500) return res.status(400).json({ error: 'limit must be an integer from 1 to 500.' });
    const rows = await listPredictions({
      task: task || undefined,
      limit: count,
    });
    return res.status(200).json({ predictions: rows });
  } catch (e) {
    return res.status(502).json({ error: 'Prediction storage is temporarily unavailable.' });
  }
}
