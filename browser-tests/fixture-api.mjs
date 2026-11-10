// Test fixture only: real route handlers, deterministic fake Auth/database.
// Never use this server as an application backend.
import http from 'node:http';
import session from '../api/session.js';
import scores from '../api/scores.js';
import predictions from '../api/predictions.js';
import logPrediction from '../api/log-prediction.js';
import claude from '../api/claude.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
Object.assign(process.env, {
  SUPABASE_URL: 'https://projecttest.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  TERMINAL_OWNER_USER_ID: OWNER, SUPABASE_SECRET_KEY: 'sb_secret_fixture', ANTHROPIC_API_KEY: 'provider_fixture',
});
global.fetch = async (url, options) => {
  if (url.endsWith('/auth/v1/user')) {
    try {
      const token = options.headers.Authorization.split(' ')[1];
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
      return Response.json({ id: claims.sub, email: claims.sub === OWNER ? 'owner@example.test' : 'other@example.test' });
    } catch { return Response.json({ error: 'Invalid fixture token' }, { status: 401 }); }
  }
  if (url.startsWith('https://projecttest.supabase.co/rest/v1/')) return Response.json([]);
  throw new Error('Unexpected external request in fixture');
};
const routes = { '/api/session': session, '/api/scores': scores, '/api/predictions': predictions, '/api/log-prediction': logPrediction, '/api/claude': claude };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let body = '';
  for await (const chunk of req) body += chunk;
  req.body = body ? JSON.parse(body) : undefined;
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); return res; };
  if (url.pathname === '/api/breadth') return res.status(502).json({ error: 'No market fixture data' });
  const route = routes[url.pathname];
  if (!route) return res.status(404).json({ error: 'Missing fixture route' });
  await route(req, res);
}).listen(3101, '127.0.0.1');
