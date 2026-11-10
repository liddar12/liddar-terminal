import { publicKey, supabaseUrl } from '../shared/authConfig.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Credentials are deliberately absent from the serializable owner object.
// Only objects returned after live Auth verification can authorize storage.
const verifiedOwners = new WeakMap();

export function verifiedOwnerStorageContext(owner) {
  const context = verifiedOwners.get(owner);
  if (!context) throw new Error('Verified owner authorization is required.');
  return context;
}

// Returns a verified owner or null after sending an error response. This must
// run before every private data access and paid provider call. A client session
// or decoded JWT alone is never evidence of authorization.
export async function requireOwner(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  const url = supabaseUrl(env.SUPABASE_URL);
  const key = publicKey(env.SUPABASE_PUBLISHABLE_KEY);
  const ownerId = env.TERMINAL_OWNER_USER_ID;
  if (!url || !key || !UUID.test(ownerId || '')) {
    res.status(503).json({ error: 'Owner authentication is not configured.' });
    return null;
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  try {
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) {
      res.status(401).json({ error: 'Your session has expired. Sign in again.' });
      return null;
    }
    if (!response.ok) throw new Error('Auth unavailable');
    const user = await response.json();
    if (!UUID.test(user?.id || '')) throw new Error('Invalid Auth response');
    if (user.id.toLowerCase() !== ownerId.toLowerCase()) {
      res.status(403).json({ error: 'This account is not authorized for this terminal.' });
      return null;
    }
    const owner = Object.freeze({ id: user.id, email: typeof user.email === 'string' ? user.email : null });
    verifiedOwners.set(owner, Object.freeze({ url, key, authorization }));
    return owner;
  } catch {
    res.status(503).json({ error: 'Sign-in verification is temporarily unavailable.' });
    return null;
  }
}
