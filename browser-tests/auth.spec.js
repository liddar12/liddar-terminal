import { test, expect } from '@playwright/test';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function session(id, email) {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const part = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${part({ alg: 'HS256' })}.${part({ sub: id, exp: expiry, role: 'authenticated' })}.fixture_signature`;
  return { access_token: token, refresh_token: 'fixture_refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiry,
    user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-10T00:00:00Z' } };
}

test('protected-preview owner sign-in, wrong-owner denial, private scores and sign-out work through real API handlers', async ({ page, request }) => {
  await page.route('https://projecttest.supabase.co/auth/v1/**', async (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version' };
    if (route.request().method() === 'OPTIONS' || route.request().url().includes('/logout')) {
      return route.fulfill({ status: 204, headers });
    }
    if (route.request().url().includes('/user')) {
      const token = route.request().headers().authorization?.split(' ')[1];
      const id = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub : OTHER;
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(session(id, id === OWNER ? 'owner@example.test' : 'other@example.test').user) });
    }
    const body = route.request().postDataJSON();
    const owner = body?.email === 'owner@example.test';
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(session(owner ? OWNER : OTHER, body?.email || 'other@example.test')) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in as owner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI Calls' })).toHaveCount(0);
  const ownerHeaders = { Authorization: `Bearer ${session(OWNER, 'owner@example.test').access_token}` };
  const blockedPreview = await request.get('/api/session', { headers: ownerHeaders });
  expect(blockedPreview.status()).toBe(403);
  expect(await blockedPreview.json()).toEqual({ error: 'Fixture preview access required.' });
  await page.context().addCookies([{ name: 'fixture_preview_access', value: 'allowed',
    url: 'http://127.0.0.1:5174', httpOnly: true, sameSite: 'Lax' }]);
  // This request context shares the browser's host-access cookie; app Auth
  // must still reject missing or wrong owner sessions independently.
  const api = page.request;
  for (const path of ['/api/scores', '/api/predictions', '/api/session']) {
    expect((await api.get(path)).status()).toBe(401);
  }
  for (const path of ['/api/log-prediction', '/api/claude']) {
    expect((await api.post(path, { data: {} })).status()).toBe(401);
  }
  await page.getByLabel('Email', { exact: true }).fill('other@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Owner account required' })).toBeVisible();
  await expect(page.getByText('This account is not authorized for this terminal.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI Calls' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to sign-in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in as owner' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI Calls' })).toBeVisible();
  const headers = ownerHeaders;
  const who = await api.get('/api/session', { headers });
  expect(await who.json()).toEqual({ user: { id: OWNER, email: 'owner@example.test' } });
  const record = { id: 'browser-import', ts: Math.floor(Date.now() / 1000), task: 'scanner', model_version: 'browser-fixture', features: {}, prediction: { side: 'call' }, horizon_s: 600 };
  expect((await api.post('/api/log-prediction', { headers, data: record })).status()).toBe(201);
  const imported = await (await api.get('/api/predictions?task=scanner', { headers })).json();
  expect(imported.predictions).toHaveLength(1);
  expect(imported.predictions[0].meta._terminal).toEqual({ owner_user_id: OWNER, provenance: 'unverified_import' });
  expect((await api.get('/api/predictions?task=nfl.game', { headers })).status()).toBe(400);
  expect((await api.post('/api/log-prediction', { headers, data: { ...record, task: 'nfl.game' } })).status()).toBe(400);
  await page.getByRole('button', { name: 'Scores', exact: true }).click();
  await expect(page.getByText('no resolved predictions yet', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'AI Calls' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in as owner' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in as owner' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('terminal-owner-session'))).toBeNull();
  expect((await api.get('/api/session')).status()).toBe(401);
});
