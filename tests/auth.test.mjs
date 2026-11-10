import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireOwner } from '../api/_auth.js';
import { assertPublicBuildConfig, publicAuthConfig, localDevApiOrigin } from '../shared/authConfig.js';
import { makeAuthenticatedFetch } from '../src/authTransport.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'header.payload.signature123456789';
const ENV = {
  SUPABASE_URL: 'https://projecttest.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', TERMINAL_OWNER_USER_ID: OWNER,
};
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; } };
}
const req = (token = TOKEN) => ({ headers: { authorization: `Bearer ${token}` } });

test('missing configuration fails closed before an Auth call', async () => {
  const res = response();
  const result = await requireOwner(req(), res, { env: {}, fetchImpl() { assert.fail('must not call Auth'); } });
  assert.equal(result, null); assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('missing and malformed credentials are rejected before upstream calls', async () => {
  for (const authorization of [undefined, '', 'Basic abc', ['Bearer bad'], 'Bearer short', `Bearer ${TOKEN}\n`]) {
    const res = response();
    await requireOwner({ headers: { authorization } }, res, { env: ENV, fetchImpl() { assert.fail('must not call'); } });
    assert.equal(res.statusCode, 401);
  }
});

test('verified owner is accepted; forged identity is never decoded locally', async () => {
  const res = response();
  const user = await requireOwner(req(), res, { env: ENV, fetchImpl: async (url, options) => {
    assert.equal(url, `${ENV.SUPABASE_URL}/auth/v1/user`);
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.redirect, 'error');
    return Response.json({ id: OWNER, email: 'owner@example.test', private_property: 'never forwarded' });
  } });
  assert.deepEqual(user, { id: OWNER, email: 'owner@example.test' });
});

test('a valid session for another account does not authorize access', async () => {
  const res = response();
  const user = await requireOwner(req(), res, { env: ENV, fetchImpl: async () => Response.json({ id: '22222222-2222-4222-8222-222222222222' }) });
  assert.equal(user, null); assert.equal(res.statusCode, 403);
});

test('expired tokens and unavailable Auth never grant access or reflect upstream bodies', async () => {
  for (const [status, expected] of [[401, 401], [403, 401], [429, 503], [500, 503]]) {
    const res = response();
    assert.equal(await requireOwner(req(), res, { env: ENV, fetchImpl: async () => new Response('sensitive upstream detail', { status }) }), null);
    assert.equal(res.statusCode, expected);
    assert.ok(!JSON.stringify(res.body).includes('sensitive'));
  }
  const res = response();
  await requireOwner(req(), res, { env: ENV, fetchImpl: async () => { throw new Error(TOKEN); } });
  assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.body).includes(TOKEN));
});

test('public build configuration rejects secret keys, dangerous URLs and stray VITE variables', () => {
  const good = { VITE_SUPABASE_URL: ENV.SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: ENV.SUPABASE_PUBLISHABLE_KEY };
  assert.ok(publicAuthConfig(good)); assertPublicBuildConfig(good); assertPublicBuildConfig({});
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.ok(publicAuthConfig({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }));
  for (const key of ['sb_secret_fixture', jwt('service_role'), 'garbage']) {
    assert.throws(() => assertPublicBuildConfig({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: key }));
  }
  for (const url of ['http://projecttest.supabase.co', 'https://evil.example', `${ENV.SUPABASE_URL}/wrong`, 'https://user:password@projecttest.supabase.co']) {
    assert.throws(() => assertPublicBuildConfig({ ...good, VITE_SUPABASE_URL: url }));
  }
  assert.throws(() => assertPublicBuildConfig({ ...good, VITE_ANTHROPIC_API_KEY: 'bad' }));
});

test('approved Vercel build inputs are accepted without accepting credential-like or unknown names', () => {
  assertPublicBuildConfig({ VITE_VERCEL_ENV: 'preview', VITE_VERCEL_REGION: 'iad1', VITE_VERCEL_URL: 'fixture.vercel.app', VITE_VERCEL_GIT_COMMIT_SHA: 'fixture' });
  assertPublicBuildConfig({ VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG: 'opaque-synthetic-build-input' });
  for (const name of [
    'VITE_VERCEL_TOKEN', 'VITE_VERCEL_OIDC_TOKEN', 'VITE_VERCEL_SECRET',
    'VITE_VERCEL_API_KEY', 'VITE_VERCEL_UNKNOWN', 'VITE_OTHER_SETTING',
    'VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG_SECRET',
    'VITE_SUPABASE_URL_SECRET', 'VITE_SUPABASE_PUBLISHABLE_KEY_SECRET',
  ]) {
    assert.throws(() => assertPublicBuildConfig({ [name]: 'fixture-must-not-ship' }), name);
  }
});

test('rejected-variable diagnostic bounds and sanitizes names without inspecting or printing values', () => {
  const secret = 'SYNTHETIC_SECRET_VALUE_MUST_NEVER_BE_LOGGED';
  const names = Array.from({ length: 12 }, (_, i) => `VITE_UNKNOWN_${String(i).padStart(2, '0')}`);
  const env = Object.fromEntries(names.map((name) => [name, secret]));
  assert.throws(() => assertPublicBuildConfig(env), (error) => {
    for (const name of names.slice(0, 8)) assert.ok(error.message.includes(name));
    for (const name of names.slice(8)) assert.ok(!error.message.includes(name));
    assert.ok(error.message.includes('(+4 more)'));
    assert.ok(!error.message.includes(secret));
    assert.ok(error.message.length < 850);
    return true;
  });
  for (const name of ['VITE_BAD\nINJECTED', 'VITE_BAD\u001b[31m', 'VITE_bad', `VITE_${'A'.repeat(100)}`]) {
    assert.throws(() => assertPublicBuildConfig({ [name]: secret }), (error) => {
      assert.ok(error.message.includes('[invalid-name]'));
      assert.ok(!error.message.includes(name));
      assert.ok(!error.message.includes(secret));
      assert.ok(!/[\n\r\u001b]/.test(error.message));
      return true;
    });
  }
  const unreadable = Object.defineProperty({}, 'VITE_CREDENTIAL', {
    enumerable: true, get() { assert.fail('the diagnostic must not inspect any rejected value'); },
  });
  assert.throws(() => assertPublicBuildConfig(unreadable), /Rejected names: VITE_CREDENTIAL/);
});

test('client sends session only to local API routes, never follows redirects or retries mutations', async () => {
  const calls = [];
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: TOKEN } } }) } };
  let expired = null;
  const api = makeAuthenticatedFetch(() => client, async (...args) => { calls.push(args); return new Response('', { status: 401 }); }, (token) => { expired = token; });
  for (const path of ['https://evil.example/api/x', '//evil.example/api/x', '/api/../private', '/api/\\evil', '/api/x\n']) {
    await assert.rejects(api(path));
  }
  assert.equal(calls.length, 0);
  await api('/api/log-prediction', { method: 'POST', headers: { Authorization: 'wrong' }, body: '{}' });
  assert.equal(calls.length, 1); assert.equal(expired, TOKEN);
  const options = calls[0][1];
  assert.equal(options.headers.get('Authorization'), `Bearer ${TOKEN}`);
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
});

test('client without a session does not send requests', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  await assert.rejects(makeAuthenticatedFetch(() => client, () => assert.fail())('/api/scores'), /Sign in/);
});

test('development proxy cannot forward owner tokens to a remote origin', () => {
  assert.equal(localDevApiOrigin('http://127.0.0.1:3101'), 'http://127.0.0.1:3101');
  assert.equal(localDevApiOrigin(), 'http://localhost:3000');
  for (const value of ['https://evil.example', 'http://127.0.0.1.evil.example:3000', 'http://localhost:3000/path', 'http://user:pass@localhost:3000']) {
    assert.throws(() => localDevApiOrigin(value), /loopback/);
  }
});
