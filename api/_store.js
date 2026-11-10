// api/_store.js
// Supabase (PostgREST) helper for the isolated trading store. Underscore prefix =
// not deployed as a function; shared by log-prediction/predictions/scores.
//
// Live-verified owner sessions use authenticated RLS. There is deliberately no
// service-key fallback and no direct access to the shared NFL tables.
import { publicKey, supabaseUrl } from '../shared/authConfig.js';
import { verifiedOwnerStorageContext } from './_auth.js';
import { isTradingTask } from './_tradingTasks.js';

export const STORAGE_BACKEND = 'shared-trading-v1';
const RPC_NAMES = new Set([
  'trade_bot_status', 'trade_bot_append_prediction',
  'trade_bot_list_predictions', 'trade_bot_list_resolved',
]);
const SCORE_RECORD_LIMIT = 5000;

function config() {
  return { url: supabaseUrl(process.env.SUPABASE_URL), key: publicKey(process.env.SUPABASE_PUBLISHABLE_KEY) };
}

export function configured() {
  const { url, key } = config();
  return process.env.TERMINAL_STORAGE_BACKEND === STORAGE_BACKEND && Boolean(url && key);
}

async function rpc(owner, name, body = {}) {
  const context = verifiedOwnerStorageContext(owner);
  const { url, key } = config();
  if (!configured() || url !== context.url || key !== context.key) throw new Error('Storage is not configured.');
  if (!RPC_NAMES.has(name)) throw new Error('Unsupported trading storage operation.');
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: context.authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Storage request failed (HTTP ${r.status}).`);
  try { return await r.json(); }
  catch { throw new Error('Storage returned invalid data.'); }
}

async function receiptCutoff(owner) {
  const status = await rpc(owner, 'trade_bot_status');
  if (status?.schema_version !== STORAGE_BACKEND || status.principal_kind !== 'owner'
    || receiptMicros(status.server_time) === null) {
    throw new Error('Trading storage is not ready for this owner.');
  }
  return status.server_time;
}

function checkTask(task) {
  if (task != null && !isTradingTask(task)) throw new Error('Invalid trading task.');
}

function receiptMicros(value) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const milliseconds = Date.parse(`${parts[1]}${parts[3]}`);
  return Number.isFinite(milliseconds)
    ? BigInt(milliseconds) * 1000n + BigInt((parts[2] || '').padEnd(6, '0'))
    : null;
}

function compareReceipts(a, b) {
  const first = receiptMicros(a.received_at); const second = receiptMicros(b.received_at);
  if (first !== second) return first > second ? 1 : -1;
  // SQL uses COLLATE "C", so compare UTF-8 bytes rather than JS UTF-16 units.
  return Buffer.compare(Buffer.from(a.id, 'utf8'), Buffer.from(b.id, 'utf8'));
}

function checkRows(rows, task, limit, { resolved = false, before = null } = {}) {
  if (!Array.isArray(rows) || rows.length > limit || rows.some((row) => (
    !row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 200
    || !isTradingTask(row.task) || (task != null && row.task !== task)
    || receiptMicros(row.received_at) === null
    || (resolved && (!Array.isArray(row.outcomes) || row.outcomes.length !== 1))
  ))) throw new Error('Storage returned invalid trading records.');
  let previous = before;
  for (const row of rows) {
    if (previous && compareReceipts(row, previous) >= 0) throw new Error('Storage returned out-of-order trading records.');
    previous = row;
  }
  return rows;
}

export async function insertPrediction(owner, rec) {
  if (!isTradingTask(rec?.task)) throw new Error('Invalid trading task.');
  await receiptCutoff(owner);
  const id = await rpc(owner, 'trade_bot_append_prediction', { p_record: rec });
  if (id !== rec.id) throw new Error('Storage returned an invalid prediction receipt.');
  return id;
}

export async function listPredictions(owner, { task, limit = 100 } = {}) {
  checkTask(task);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid prediction limit.');
  const asOf = await receiptCutoff(owner);
  const rows = await rpc(owner, 'trade_bot_list_predictions', {
    p_task: task ?? null, p_limit: limit, p_as_of: asOf,
  });
  return checkRows(rows, task, limit);
}

export async function listResolved(owner, { task } = {}) {
  checkTask(task);
  const asOf = await receiptCutoff(owner);
  const rows = [];
  const ids = new Set();
  let cursor = {};
  // Keyset pages share one database receipt cutoff. This is not an exported
  // MVCC snapshot: reproducible evaluation also needs completed ingestion.
  while (true) {
    const limit = Math.min(500, SCORE_RECORD_LIMIT + 1 - rows.length);
    const page = checkRows(await rpc(owner, 'trade_bot_list_resolved', {
      p_task: task ?? null, p_limit: limit, p_as_of: asOf, ...cursor,
    }), task, limit, { resolved: true, before: cursor.p_before_id == null ? null : {
      id: cursor.p_before_id, received_at: cursor.p_before_received_at,
    } });
    for (const row of page) {
      if (ids.has(row.id)) throw new Error('Storage returned a repeated prediction.');
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > SCORE_RECORD_LIMIT) throw new Error('Score history exceeds the supported request size.');
    if (page.length < limit) return rows;
    const last = page.at(-1);
    cursor = { p_before_received_at: last.received_at, p_before_id: last.id };
  }
}

// --- scoring (mirrors selflearn_core.scoring.metrics conventions) ---

export function wilsonCi(k, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function scoreIdeas(resolvedRows) {
  // rows: prediction fields + outcomes: [{resolved_ts, realized}]
  const byGroup = new Map(); // task|cohort -> {hits, n}
  for (const row of resolvedRows) {
    const outcome = Array.isArray(row.outcomes) ? row.outcomes[0] : row.outcomes;
    const realized = outcome?.realized;
    let hit = null;
    if (realized && typeof realized.hit === 'boolean') hit = realized.hit;
    else if (realized && typeof realized.signed_return === 'number') hit = realized.signed_return > 0;
    if (hit === null) continue;
    for (const cohort of [null, row.cohort].filter((c, i) => i === 0 || c != null)) {
      const key = `${row.task}\u0000${cohort ?? ''}`;
      const g = byGroup.get(key) || { task: row.task, cohort, hits: 0, n: 0 };
      g.hits += hit ? 1 : 0;
      g.n += 1;
      byGroup.set(key, g);
    }
  }
  return [...byGroup.values()].map((g) => {
    const [lo, hi] = wilsonCi(g.hits, g.n);
    return {
      task: g.task,
      cohort: g.cohort,
      metric: 'hit_rate',
      value: g.n ? g.hits / g.n : 0,
      n: g.n,
      window: 'all',
      ci_low: lo,
      ci_high: hi,
    };
  });
}
