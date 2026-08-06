// api/log-prediction.js
// Append-only prediction log (Gate 4 write-side). Accepts a prediction record
// conforming to SelfLearning's prediction_record.schema.json (incl. the
// optional features.breadth regime stamp) and inserts it into the shared
// store. 503 until Supabase env vars are configured — fail visibly.

import { configured, insertPrediction } from './_store.js';

const REQUIRED = ['id', 'ts', 'model_version', 'task', 'features', 'prediction', 'horizon_s'];
const DIRECTIONS = new Set(['rising', 'falling', 'flat']);
const LEVELS = new Set(['above', 'below']);

function validate(rec) {
  if (!rec || typeof rec !== 'object') return 'record must be an object';
  for (const k of REQUIRED) if (!(k in rec)) return `missing required field: ${k}`;
  if (!Number.isInteger(rec.ts)) return 'ts must be an integer (unix seconds)';
  if (!Number.isInteger(rec.horizon_s) || rec.horizon_s < 1) return 'horizon_s must be an integer >= 1';
  if (typeof rec.features !== 'object') return 'features must be an object';
  const c = rec.confidence;
  if (c != null && (typeof c !== 'number' || c < 0 || c > 1)) return 'confidence must be in [0,1]';
  const b = rec.features.breadth;
  if (b != null) {
    if (!DIRECTIONS.has(b.direction)) return 'breadth.direction invalid';
    if (!LEVELS.has(b.vs50dma) || !LEVELS.has(b.vs200dma)) return 'breadth.vs*dma invalid';
    if (typeof b.ratio !== 'number') return 'breadth.ratio must be a number';
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!configured()) {
    return res.status(503).json({
      error: 'storage not configured: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    });
  }
  try {
    const rec = req.body;
    const bad = validate(rec);
    if (bad) return res.status(400).json({ error: bad });
    await insertPrediction({
      id: rec.id,
      ts: rec.ts,
      model_version: rec.model_version,
      task: rec.task,
      features: rec.features,
      prediction: rec.prediction,
      confidence: rec.confidence ?? null,
      horizon_s: rec.horizon_s,
      cohort: rec.cohort ?? null,
      meta: rec.meta ?? {},
    });
    return res.status(201).json({ ok: true, id: rec.id });
  } catch (e) {
    console.error('log-prediction failed:', e.message);
    return res.status(502).json({ error: `log failed: ${e.message}` });
  }
}
