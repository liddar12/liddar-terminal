import { test } from 'node:test';
import assert from 'node:assert/strict';
import logPrediction, { validate } from '../api/log-prediction.js';
import predictions from '../api/predictions.js';
import scores from '../api/scores.js';
import claude from '../api/claude.js';
import session from '../api/session.js';
import { insertPrediction } from '../api/_store.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'header.payload.signature123456789';
const record = { id: 'test-prediction', ts: 1780000000, task: 'scanner', model_version: 'scanner-v1', features: {}, prediction: { side: 'call' }, horizon_s: 600 };
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; } };
}
function setup(t, fetchImpl) {
  const oldEnv = { ...process.env }; const oldFetch = global.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://projecttest.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    TERMINAL_OWNER_USER_ID: OWNER, SUPABASE_SECRET_KEY: 'sb_secret_fixture', ANTHROPIC_API_KEY: 'provider_fixture',
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

test('owner prediction writes carry server provenance and opaque secrets only in apikey', async (t) => {
  let inserted;
  setup(t, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    assert.ok(url.endsWith('/rest/v1/predictions'));
    assert.equal(options.headers.apikey, 'sb_secret_fixture');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.redirect, 'error');
    inserted = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  });
  const res = response(); await logPrediction(request('POST'), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(inserted.meta._terminal, { owner_user_id: OWNER, provenance: 'unverified_import' });
  assert.equal(inserted.received_at, undefined);
  const bad = response(); await logPrediction(request('POST', { ...record, meta: { _terminal: { provenance: 'verified' } } }), bad);
  assert.equal(bad.statusCode, 400);
});

test('store supports legacy keys without leaking failures', async (t) => {
  setup(t, async (_url, options) => {
    assert.equal(options.headers.authorization, 'Bearer legacy-fixture');
    return new Response('private database details', { status: 500 });
  });
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-fixture';
  await assert.rejects(insertPrediction(record), (e) => e.message === 'Storage request failed (HTTP 500).');
});

test('invalid data is rejected without database work', async (t) => {
  setup(t, async (url) => { assert.ok(url.endsWith('/auth/v1/user')); return Response.json({ id: OWNER }); });
  for (const rec of [{ ...record, features: null }, { ...record, confidence: NaN }, { ...record, horizon_s: 0 }, { ...record, ts: 99999999999 }, { ...record, meta: [] }]) {
    assert.ok(validate(rec)); const res = response(); await logPrediction(request('POST', rec), res); assert.equal(res.statusCode, 400);
  }
});

test('owner can read private records and scores through the backend', async (t) => {
  const rows = [{ task: 'scanner', cohort: 'SPY', outcomes: [{ realized: { hit: true } }] }];
  setup(t, async (url) => url.endsWith('/auth/v1/user') ? Response.json({ id: OWNER }) : Response.json(rows));
  const p = response(); await predictions(request('GET'), p); assert.deepEqual(p.body.predictions, rows);
  const s = response(); await scores(request('GET'), s); assert.equal(s.body.resolved_count, 1); assert.equal(s.body.scores[0].value, 1);
  const bad = response(); await predictions({ ...request('GET'), query: { limit: '-1' } }, bad); assert.equal(bad.statusCode, 400);
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
