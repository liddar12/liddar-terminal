import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Documented metadata plus the observed platform configuration name. All values
// are synthetic; accepting a build input does not classify its value as public.
const METADATA_NAMES = [
  'VITE_VERCEL_ENV', 'VITE_VERCEL_TARGET_ENV', 'VITE_VERCEL_REGION', 'VITE_VERCEL_URL',
  'VITE_VERCEL_BRANCH_URL', 'VITE_VERCEL_PROJECT_PRODUCTION_URL',
  'VITE_VERCEL_DEPLOYMENT_ID', 'VITE_VERCEL_PROJECT_ID',
  'VITE_VERCEL_GIT_PROVIDER', 'VITE_VERCEL_GIT_REPO_SLUG',
  'VITE_VERCEL_GIT_REPO_OWNER', 'VITE_VERCEL_GIT_REPO_ID',
  'VITE_VERCEL_GIT_COMMIT_REF', 'VITE_VERCEL_GIT_COMMIT_SHA',
  'VITE_VERCEL_GIT_COMMIT_MESSAGE', 'VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN',
  'VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME', 'VITE_VERCEL_GIT_PREVIOUS_SHA',
  'VITE_VERCEL_GIT_PULL_REQUEST_ID',
  'VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG',
];

test('production build with Vercel inputs ships only the public Auth settings', async (t) => {
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  // Use only synthetic public values, never an actual deployment environment.
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  const markers = METADATA_NAMES.map((_, i) => `VERCEL_METADATA_MUST_NOT_SHIP_${i}_FIXTURE`);
  METADATA_NAMES.forEach((name, i) => { process.env[name] = markers[i]; });
  process.env.VITE_SUPABASE_URL = 'https://buildfixture.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_build_fixture';

  const result = await build({
    root: fileURLToPath(new URL('..', import.meta.url)),
    mode: 'production', logLevel: 'silent',
    build: { write: false, minify: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const bundle = outputs.map((o) => o.type === 'chunk' ? o.code : String(o.source)).join('\n');
  assert.ok(bundle.includes('https://buildfixture.supabase.co'), 'the real Auth configuration must be included');
  assert.ok(bundle.includes('sb_publishable_build_fixture'), 'the public Auth key must be included');
  for (const marker of markers) assert.ok(!bundle.includes(marker), 'Vercel metadata must not enter the public bundle');
});
