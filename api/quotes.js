// api/quotes.js
// Compact per-ticker market lines for the AI Calls / AI Puts scanner prompt.
// Replaces the Finnhub quotes the original V2 terminal fetched in the browser
// (with keys shipped in the client bundle). Server-side, no keys, Yahoo daily
// chart endpoint, same unofficial-source caveat as api/breadth.js.
//
// GET /api/quotes?symbols=NVDA,MSFT,SPY   (max 15)
// 200 → { asOf, quotes: { NVDA: { c, d, dp, trend }, ... }, errors: { SYM: "..." } }
//        c = last price, d = change vs prior close, dp = % change,
//        trend = "up" | "down" | "flat" (last-5 vs prior-5 close average, ±0.5%,
//        the same rule the V2 scanner used).
// 502 → { error } when no symbol could be fetched. Callers must not invent prices.

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' };
const MAX_SYMBOLS = 15;
const CACHE_TTL_MS = 25_000;
const cache = new Map(); // symbol -> { at, quote }

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

export function trendOf(closes) {
  const c = closes.filter((x) => x != null);
  if (c.length < 6) return 'flat';
  const last5 = c.slice(-5);
  const prev5 = c.slice(-10, -5);
  const a = last5.reduce((s, x) => s + x, 0) / last5.length;
  const b = prev5.length ? prev5.reduce((s, x) => s + x, 0) / prev5.length : a;
  if (a > b * 1.005) return 'up';
  if (a < b * 0.995) return 'down';
  return 'flat';
}

export function quoteFromChart(j) {
  const res = j?.chart?.result?.[0];
  const closes = res?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) throw new Error('malformed response');
  const clean = closes.filter((x) => x != null);
  const live = res?.meta?.regularMarketPrice ?? clean[clean.length - 1];
  // The daily series' last bar is today's (live or final); the bar before it is the prior close.
  const prevClose = clean.length >= 2 ? clean[clean.length - 2] : res?.meta?.chartPreviousClose;
  if (live == null || prevClose == null || prevClose === 0) throw new Error('missing price');
  const d = live - prevClose;
  return {
    c: +live.toFixed(2),
    d: +d.toFixed(2),
    dp: +((d / prevClose) * 100).toFixed(2),
    trend: trendOf(clean),
  };
}

async function fetchQuote(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.quote;
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?range=1mo&interval=1d&includePrePost=false`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const quote = quoteFromChart(await r.json());
  cache.set(symbol, { at: Date.now(), quote });
  return quote;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const symbols = String(req.query?.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: 'symbols= required' });
  if (symbols.length > MAX_SYMBOLS) return res.status(400).json({ error: `max ${MAX_SYMBOLS} symbols` });
  const bad = symbols.filter((s) => !SYMBOL_RE.test(s));
  if (bad.length) return res.status(400).json({ error: `invalid symbol(s): ${bad.join(', ')}` });

  const settled = await Promise.allSettled(symbols.map(fetchQuote));
  const quotes = {};
  const errors = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') quotes[symbols[i]] = r.value;
    else errors[symbols[i]] = r.reason?.message || 'failed';
  });

  if (!Object.keys(quotes).length) {
    return res.status(502).json({ error: 'quotes unavailable', errors });
  }
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ asOf: new Date().toISOString(), quotes, errors });
}
