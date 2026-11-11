// Injectable transport keeps bearer tokens on this application's API origin.
export function makeAuthenticatedFetch(getClient, fetchImpl = fetch, onUnauthorized = () => {}) {
  return async function authenticatedFetch(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('\\')
      || path.includes('#') || /[\u0000-\u0020]/.test(path)) {
      throw new Error('Authenticated requests must use a local API path.');
    }
    const parsed = new URL(path, 'https://terminal.invalid');
    if (parsed.origin !== 'https://terminal.invalid' || !parsed.pathname.startsWith('/api/')) {
      throw new Error('Authenticated requests must use a local API path.');
    }
    const client = getClient();
    if (!client) throw new Error('Sign-in is not configured.');
    const { data, error } = await client.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error('Sign in to continue.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetchImpl(path, {
      // Protected previews also require their same-origin access cookie.
      // The destination guard above and redirect refusal keep credentials local.
      ...options, headers, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    });
    if (response.status === 401) onUnauthorized(token);
    return response;
  };
}
