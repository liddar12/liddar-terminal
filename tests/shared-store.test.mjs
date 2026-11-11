import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireOwner } from '../api/_auth.js';
import { insertPrediction, listPredictions, listResolved } from '../api/_store.js';
import { isTradingTask } from '../api/_tradingTasks.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'header.payload.signature123456789';
const NOW = '2026-11-10T22:00:00.000Z';
const status = { schema_version: 'shared-trading-v1', principal_kind: 'owner', server_time: NOW };
const rec = { id: 'test-1', task: 'scanner' };
const response = () => ({ setHeader() {}, status() { return this; }, json() { return this; } });

async function setup(t, storageFetch) {
  const oldEnv = { ...process.env }; const oldFetch = global.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://projecttest.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    TERMINAL_OWNER_USER_ID: OWNER, TERMINAL_STORAGE_BACKEND: 'shared-trading-v1',
    SUPABASE_SECRET_KEY: 'sb_secret_should_never_be_used', SUPABASE_SERVICE_ROLE_KEY: 'legacy_should_never_be_used',
  });
  const owner = await requireOwner({ headers: { authorization: `Bearer ${TOKEN}` } }, response(), {
    fetchImpl: async () => Response.json({ id: OWNER }),
  });
  global.fetch = storageFetch;
  t.after(() => { process.env = oldEnv; global.fetch = oldFetch; });
  return owner;
}
const row = (id) => ({ id, task: 'scanner', received_at: NOW, outcomes: [{ realized: { hit: true } }] });

test('only the exact live-verified owner context can reach storage', async (t) => {
  const owner = await setup(t, () => assert.fail('unverified objects cannot perform a fetch'));
  for (const fake of [undefined, null, {}, { ...owner }, { id: OWNER, authorization: `Bearer ${TOKEN}` }]) {
    await assert.rejects(listPredictions(fake), /Verified owner/);
    await assert.rejects(insertPrediction(fake, rec), /Verified owner/);
  }
  process.env.SUPABASE_URL = 'https://otherproject.supabase.co';
  await assert.rejects(listPredictions(owner), /not configured/);
});

test('migration version, database principal and receipt clock must be valid', async (t) => {
  let current = status;
  const owner = await setup(t, (url) => {
    assert.ok(url.endsWith('/rpc/trade_bot_status'), 'no data operation after invalid status');
    return Response.json(current);
  });
  for (const bad of [null, {}, { ...status, schema_version: 'old' }, { ...status, principal_kind: 'worker' }, { ...status, server_time: 'bad' }]) {
    current = bad;
    await assert.rejects(listPredictions(owner), /not ready/);
  }
});

test('unexpected NFL rows and invalid list shapes fail without returning any records', async (t) => {
  let data;
  const owner = await setup(t, (url) => Response.json(url.endsWith('/rpc/trade_bot_status') ? status : data));
  for (const bad of [{ rows: [] }, [row('good'), { ...row('wrong'), task: 'nfl.game' }], [{ ...row('bad'), received_at: null }]]) {
    data = bad; await assert.rejects(listPredictions(owner), /invalid trading records/);
  }
  data = [{ ...row('wrong'), task: 'trading.options' }];
  await assert.rejects(listPredictions(owner, { task: 'scanner' }), /invalid trading records/);
});

test('scores use a fixed receipt cutoff and keyset pages, including the final short page', async (t) => {
  const first = Array.from({ length: 500 }, (_, i) => row(`p${String(10000 - i).padStart(6, '0')}`));
  let calls = 0;
  const owner = await setup(t, (url, options) => {
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    assert.ok(url.endsWith('/rpc/trade_bot_list_resolved'));
    const body = JSON.parse(options.body);
    assert.equal(body.p_as_of, NOW); assert.equal(body.p_limit, 500); assert.equal(body.p_task, 'scanner');
    if (calls++ === 0) {
      assert.equal(body.p_before_id, undefined);
      return Response.json(first);
    }
    assert.equal(body.p_before_id, first.at(-1).id);
    assert.equal(body.p_before_received_at, NOW);
    return Response.json([row('final')]);
  });
  const rows = await listResolved(owner, { task: 'scanner' });
  assert.equal(rows.length, 501); assert.equal(calls, 2);
});

test('duplicate pages fail rather than biasing the score sample', async (t) => {
  const repeated = Array.from({ length: 500 }, (_, i) => row(`p${String(10000 - i).padStart(6, '0')}`));
  const owner = await setup(t, (url) => Response.json(url.endsWith('/rpc/trade_bot_status') ? status : repeated));
  await assert.rejects(listResolved(owner), /out-of-order trading records/);
});

test('cursor ordering preserves microseconds and SQL UTF-8 collation', async (t) => {
  let data;
  const owner = await setup(t, (url) => Response.json(url.endsWith('/rpc/trade_bot_status') ? status : data));
  data = [
    { ...row('a'), received_at: '2026-11-10T21:00:00.123456+00:00' },
    { ...row('z'), received_at: '2026-11-10T21:00:00.123455+00:00' },
  ];
  assert.deepEqual(await listPredictions(owner), data);
  data = [row('\u{10000}'), row('\uE000')];
  assert.deepEqual(await listPredictions(owner), data, 'UTF-8 ordering differs from JS UTF-16 for these IDs');
  data = [...data].reverse();
  await assert.rejects(listPredictions(owner), /out-of-order/);
});

test('oversized score histories fail rather than present a truncated all-time score', async (t) => {
  let page = 0;
  const owner = await setup(t, (url, options) => {
    if (url.endsWith('/rpc/trade_bot_status')) return Response.json(status);
    const { p_limit: count } = JSON.parse(options.body);
    const current = page++;
    return Response.json(Array.from({ length: count }, (_, i) => ({
      ...row(`page-${current}-id-${i}`),
      received_at: `2026-11-10T21:00:00.${String(100000 - current * 500 - i).padStart(6, '0')}Z`,
    })));
  });
  await assert.rejects(listResolved(owner), /exceeds the supported request size/);
  assert.equal(page, 11);
});

test('trading task identifiers match the explicit SQL namespace contract', () => {
  for (const task of ['scanner', 'trade_decision', 'price_action_trend', 'trading.options', 'trading.spx.vertical-v1']) assert.equal(isTradingTask(task), true);
  for (const task of ['nfl.game', 'wc.match', 'public.predictions', '', 'trading.', 'trading.X', `trading.${'a'.repeat(200)}`, null, []]) assert.equal(isTradingTask(task), false);
});
