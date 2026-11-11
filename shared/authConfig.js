// Shared validation; this file must never import or read server secrets.
export function supabaseUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)
      || u.username || u.password || u.port || u.search || u.hash || !['', '/'].includes(u.pathname)) return null;
    return u.origin;
  } catch { return null; }
}

export function publicKey(value) {
  if (typeof value !== 'string') return null;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return value;
  // Legacy anon JWT support only. This decodes a configuration value; user
  // identity is always validated remotely by Supabase Auth, never here.
  try {
    const parts = value.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon' ? value : null;
  } catch { return null; }
}

export function publicAuthConfig(env = {}) {
  const url = supabaseUrl(env.VITE_SUPABASE_URL);
  const key = publicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return url && key ? { url, key } : null;
}

// These are the only application settings permitted in the browser bundle.
export const PUBLIC_AUTH_ENV_NAMES = Object.freeze([
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY',
]);

// Vercel injects these documented metadata names for Vite builds. Accept the
// exact names at build time, but exclude them from the browser via envPrefix.
// https://vercel.com/docs/environment-variables/framework-environment-variables
// REGION is also explicitly injected by official @vercel/build-utils:
// https://github.com/vercel/vercel/blob/main/packages/build-utils/src/get-prefixed-env-vars.ts
// OBSERVABILITY_CLIENT_CONFIG was observed as an injected build input on
// dpl_7ref4rpzSQfGoPmyHbBnfaRhTVFA. Its value was not inspected and is NOT
// classified as public or exposed to the browser.
const VERCEL_BUILD_ENV_NAMES = new Set([
  'ENV', 'TARGET_ENV', 'REGION', 'URL', 'BRANCH_URL', 'PROJECT_PRODUCTION_URL',
  'DEPLOYMENT_ID', 'PROJECT_ID', 'GIT_PROVIDER', 'GIT_REPO_SLUG',
  'GIT_REPO_OWNER', 'GIT_REPO_ID', 'GIT_COMMIT_REF', 'GIT_COMMIT_SHA',
  'GIT_COMMIT_MESSAGE', 'GIT_COMMIT_AUTHOR_LOGIN', 'GIT_COMMIT_AUTHOR_NAME',
  'GIT_PREVIOUS_SHA', 'GIT_PULL_REQUEST_ID',
  'OBSERVABILITY_CLIENT_CONFIG',
].map((name) => `VITE_VERCEL_${name}`));

export function assertPublicBuildConfig(env = {}) {
  const allowed = new Set(PUBLIC_AUTH_ENV_NAMES);
  const rejected = Object.keys(env).filter((k) => k.startsWith('VITE_') && !allowed.has(k) && !VERCEL_BUILD_ENV_NAMES.has(k)).sort();
  if (rejected.length) {
    // Build-only diagnostic: at most 8 names of at most 80 safe characters.
    // Never inspect values; malformed names cannot inject control characters.
    const names = rejected.slice(0, 8).map((k) => /^VITE_[A-Z0-9_]{1,75}$/.test(k) ? k : '[invalid-name]');
    const remaining = rejected.length > 8 ? ` (+${rejected.length - 8} more)` : '';
    throw new Error(`Only approved public sign-in settings and Vercel build input names may use the VITE_ prefix. Rejected names: ${names.join(', ')}${remaining}. Values omitted.`);
  }
  if ((env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY) && !publicAuthConfig(env)) {
    throw new Error('Invalid public sign-in settings. Never put a secret or service-role key in VITE_ variables.');
  }
}

export function localDevApiOrigin(value = 'http://localhost:3000') {
  try {
    const u = new URL(value);
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/') return u.origin;
  } catch { /* handled below */ }
  throw new Error('The development API proxy must use a loopback HTTP origin.');
}
