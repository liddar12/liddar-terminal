// api/log-prediction.js
// Append-only prediction log (Gate 4 write-side). Accepts a prediction record
// conforming to SelfLearning's prediction_record.schema.json (incl. the
// optional features.breadth regime stamp) and inserts it into the shared
// store. 503 until Supabase env vars are configured — fail visibly.

import { configured, insertPrediction } from './_store.js';
import { requireOwner } from './_auth.js';

const REQUIRED = ['id', 'ts', 'model_version', 'task', 'features', 'prediction', 'horizon_s'];
const DIRECTIONS = new Set(['rising', 'falling', 'flat']);
const LEVELS = new Set(['above', 'below']);

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validate(rec) {
  if (!object(rec)) return 'record must be an object';
  for (const k of REQUIRED) if (!(k in rec)) return `missing required field: ${k}`;
  for (const k of ['id', 'model_version', 'task']) {
    if (typeof rec[k] !== 'string' || !rec[k].trim() || rec[k].length > 200) return `${k} must be a nonempty string of at most 200 characters`;
  }
  if (!Number.isSafeInteger(rec.ts) || rec.ts < 0 || rec.ts > Math.floor(Date.now() / 1000) + 300) return 'ts must be valid unix seconds, not in the future';
  if (!Number.isSafeInteger(rec.horizon_s) || rec.horizon_s < 1 || rec.horizon_s > 315576000) return 'horizon_s must be an integer from 1 to 315576000';
  if (!object(rec.features)) return 'features must be an object';
  if (rec.meta != null && !object(rec.meta)) return 'meta must be an object';
  if (rec.meta && '_terminal' in rec.meta) return 'meta._terminal is server-owned';
  if (rec.cohort != null && (typeof rec.cohort !== 'string' || rec.cohort.length > 200)) return 'cohort must be a string of at most 200 characters';
  if (JSON.stringify(rec).length > 64000) return 'record is too large';
  const c = rec.confidence;
  if (c != null && (!Number.isFinite(c) || c < 0 || c > 1)) return 'confidence must be in [0,1]';
  const b = rec.features.breadth;
  if (b != null) {
    if (!DIRECTIONS.has(b.direction)) return 'breadth.direction invalid';
    if (!LEVELS.has(b.vs50dma) || !LEVELS.has(b.vs200dma)) return 'breadth.vs*dma invalid';
    if (!Number.isFinite(b.ratio)) return 'breadth.ratio must be a finite number';
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const user = await requireOwner(req, res);
  if (!user) return;
  if (!configured()) {
    return res.status(503).json({
      error: 'Storage is not configured.',
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
      // Authentication does not prove the model or client timestamp is genuine.
      // Imported ideas must not be treated as verified forward evidence.
      meta: { ...(rec.meta ?? {}), _terminal: { owner_user_id: user.id, provenance: 'unverified_import' } },
    });
    return res.status(201).json({ ok: true, id: rec.id });
  } catch (e) {
    return res.status(502).json({ error: 'Prediction storage is temporarily unavailable.' });
  }
}
