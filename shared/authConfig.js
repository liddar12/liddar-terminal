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

export function assertPublicBuildConfig(env = {}) {
  const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
  if (Object.keys(env).some((k) => k.startsWith('VITE_') && !allowed.has(k))) {
    throw new Error('Only the documented public sign-in settings may use the VITE_ prefix.');
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
