// api/scores.js
// Live scores over resolved predictions (read-only). Hit rate with Wilson CI,
// grouped by task and cohort, mirroring selflearn_core.scoring conventions.
// Unresolved predictions are excluded; until outcomes exist this returns an
// empty list (honest, not fabricated).

import { configured, listResolved, scoreIdeas } from './_store.js';
import { requireOwner } from './_auth.js';
import { isTradingTask } from './_tradingTasks.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const owner = await requireOwner(req, res);
  if (!owner) return;
  if (!configured()) {
    return res.status(503).json({
      error: 'Storage is not configured.',
    });
  }
  try {
    const { task } = req.query || {};
    if (task != null && !isTradingTask(task)) return res.status(400).json({ error: 'Invalid trading task.' });
    const rows = await listResolved(owner, { task });
    return res.status(200).json({ scores: scoreIdeas(rows), resolved_count: rows.length });
  } catch (e) {
    return res.status(502).json({ error: 'Prediction storage is temporarily unavailable.' });
  }
}
