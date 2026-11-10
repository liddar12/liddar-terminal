import { requireOwner } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const user = await requireOwner(req, res);
  if (!user) return;
  return res.status(200).json({ user });
}
