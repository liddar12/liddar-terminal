import { test } from 'node:test';
import assert from 'node:assert/strict';
import logPrediction, { validate } from '../api/log-prediction.js';
import predictions from '../api/predictions.js';
import scores from '../api/scores.js';
import claude from '../api/claude.js';
import session from '../api/session.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'header.payload.signature123456789';
const NOW = '2026-11-10T22:00:00.000Z';
const status = { schema_version: 'shared-trading-v1', principal_kind: 'owner', server_time: NOW };
const record = { id: 'test-prediction', ts: 1780000000, task: 'scanner', model_version: 'scanner-v1', features: {}, prediction: { side: 'call' }, horizon_s: 600 };
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; } };
}
function setup(t, fetchImpl) {
  const oldEnv = { ...process.env }; const oldFetch = global.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://projecttest.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    TERMINAL_OWNER_USER_ID: OWNER, TERMINAL_STORAGE_BACKEND: 'shared-trading-v1',
    SUPABASE_SECRET_KEY: 'sb_secret_fixture', SUPABASE_SERVICE_ROLE_KEY: 'legacy_private_fixture',
    ANTHROPIC_API_KEY: 'provider_fixture',
  });
  global.fetch = fetchImpl;
  t.after(() => { process.env = oldEnv; global.fetch = oldFetch; });
}
const request = (method, body = record) => ({ method, body, query: {}, headers: { authorization: `Bearer ${TOKEN}` } });

test('every private or paid route rejects anonymous and wrong-owner calls before touching data/provider', async (t) => {
  const routes = [[logPrediction, 'POST'], [predictions, 'GET'], [scores, 'GET'], [claude, 'POST'], [session, 'GET']];
  let calls = 0;
  setup(t, async (url) => {
    calls++; assert.ok(url.endsWith('/auth/v1/user'), 'no storage/provider access allowed');
    return Response.json({ id: '22222222-2222-4222-8222-222222222222' });
  });
  for (const [route, method] of routes) {
    const anonymous = response();
    await route({ method, headers: {} }, anonymous);
    assert.equal(anonymous.statusCode, 401);
  }
  assert.equal(calls, 0);
  for (const [route, method] of routes) {
    const denied = response(); await route(request(method), denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(denied.headers['Cache-Control'], 'private, no-store');
  }
  assert.equal(calls, routes.length);
});

test('owner prediction RPC uses verified user bearer and public key without global database keys', async (t) => {
  let inserted;
  setup(t, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    assert.equal(options.headers.apikey, 'sb_publishable_fixture');
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!JSON.stringify(options).includes('sb_secret_fixture'));
    assert.ok(!JSON.stringify(options).includes('legacy_private_fixture'));
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    assert.ok(url.endsWith('/rpc/trade_bot_append_prediction'));
    inserted = JSON.parse(options.body).p_record;
    return Response.json(inserted.id);
  });
  const res = response(); await logPrediction(request('POST'), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(inserted.meta._terminal, { owner_user_id: OWNER, provenance: 'unverified_import' });
  assert.equal(inserted.received_at, undefined);
  const bad = response(); await logPrediction(request('POST', { ...record, meta: { _terminal: { provenance: 'verified' } } }), bad);
  assert.equal(bad.statusCode, 400);
});

test('shared storage requires explicit enablement even when global database keys exist', async (t) => {
  setup(t, async (url) => {
    assert.ok(url.endsWith('/auth/v1/user'), 'no storage request while mode is missing or incorrect');
    return Response.json({ id: OWNER });
  });
  for (const mode of [undefined, 'public', 'dedicated', 'shared-trading-v2']) {
    if (mode === undefined) delete process.env.TERMINAL_STORAGE_BACKEND;
    else process.env.TERMINAL_STORAGE_BACKEND = mode;
    for (const [route, method] of [[logPrediction, 'POST'], [predictions, 'GET'], [scores, 'GET']]) {
      const res = response(); await route(request(method), res); assert.equal(res.statusCode, 503);
    }
  }
});

test('invalid data is rejected without database work', async (t) => {
  setup(t, async (url) => { assert.ok(url.endsWith('/auth/v1/user')); return Response.json({ id: OWNER }); });
  for (const rec of [{ ...record, features: null }, { ...record, confidence: NaN }, { ...record, horizon_s: 0 }, { ...record, ts: 99999999999 }, { ...record, meta: [] }, { ...record, task: 'nfl.game' }]) {
    assert.ok(validate(rec)); const res = response(); await logPrediction(request('POST', rec), res); assert.equal(res.statusCode, 400);
  }
});

test('owner can read private records and scores through the backend', async (t) => {
  const rows = [{ id: 'resolved-1', received_at: NOW, task: 'scanner', cohort: 'SPY', outcomes: [{ realized: { hit: true } }] }];
  setup(t, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    assert.ok(url.endsWith('/rpc/trade_bot_list_predictions') || url.endsWith('/rpc/trade_bot_list_resolved'));
    assert.equal(JSON.parse(options.body).p_as_of, NOW);
    return Response.json(rows);
  });
  const p = response(); await predictions(request('GET'), p); assert.deepEqual(p.body.predictions, rows);
  const s = response(); await scores(request('GET'), s); assert.equal(s.body.resolved_count, 1); assert.equal(s.body.scores[0].value, 1);
  const bad = response(); await predictions({ ...request('GET'), query: { limit: '-1' } }, bad); assert.equal(bad.statusCode, 400);
});

test('session responses contain only public owner identity and never the bearer', async (t) => {
  setup(t, async () => Response.json({ id: OWNER, email: 'owner@example.test' }));
  const res = response(); await session(request('GET'), res);
  assert.deepEqual(res.body, { user: { id: OWNER, email: 'owner@example.test' } });
  assert.ok(!JSON.stringify(res.body).includes(TOKEN));
});

test('NFL and manipulated task filters fail before any trading RPC', async (t) => {
  setup(t, async (url) => { assert.ok(url.endsWith('/auth/v1/user')); return Response.json({ id: OWNER }); });
  for (const task of ['nfl.game', 'public.predictions', 'scanner&schema=public', '', ['scanner'], 'trading.', 'trading.SPY', 'trading.a\n']) {
    for (const route of [predictions, scores]) {
      const res = response(); await route({ ...request('GET'), query: { task } }, res);
      assert.equal(res.statusCode, 400);
    }
  }
});

test('omitted task and supplied schema/RPC fields cannot select NFL storage', async (t) => {
  setup(t, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    assert.ok(url.endsWith('/rpc/trade_bot_list_predictions'));
    assert.deepEqual(JSON.parse(options.body), { p_task: null, p_limit: 100, p_as_of: NOW });
    return Response.json([]);
  });
  const res = response(); await predictions({ ...request('GET'), query: { schema: 'public', rpc: 'read_nfl' } }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.predictions, []);
});

test('storage failures are bounded, do not retry imports, and never return upstream details', async (t) => {
  let writes = 0;
  setup(t, async (url) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    writes++; return new Response(`sensitive database detail ${TOKEN}`, { status: 500 });
  });
  const res = response(); await logPrediction(request('POST'), res);
  assert.equal(writes, 1); assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'Prediction storage is temporarily unavailable.');
  assert.ok(!JSON.stringify(res.body).includes(TOKEN));
});

test('paid requests use a server-selected model and bounded request', async (t) => {
  let providerCalls = 0;
  setup(t, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    providerCalls++;
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'server-model'); assert.equal(body.max_tokens, 100);
    return Response.json({ content: [{ type: 'text', text: '[]' }] });
  });
  process.env.CLAUDE_MODEL = 'server-model';
  const body = { model: 'client-model', max_tokens: 100, messages: [{ role: 'user', content: 'Research' }] };
  const res = response(); await claude(request('POST', body), res); assert.equal(res.statusCode, 200);
  const bad = response(); await claude(request('POST', { ...body, max_tokens: 100000 }), bad); assert.equal(bad.statusCode, 400);
  assert.equal(providerCalls, 1);
});
