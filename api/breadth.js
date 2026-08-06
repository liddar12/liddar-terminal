// api/breadth.js
// RSP/SPY breadth ratio: serves the Breadth tab chart AND the regime string
// consumed by the AI Calls / AI Puts prompt builders.
//
// Same serverless pattern as api/claude.js. No dependencies, Node 18+ (global fetch).
//
// GET /api/breadth
// 200 → {
//   asOf: "2026-08-06T14:31:02.113Z",
//   last: 0.2861,                    // latest ratio (intraday when market open)
//   dma50: 0.2839, dma200: 0.2852,
//   levels: { support: 0.2822, dma200Level: 0.2852, resistance: 0.2988 },
//   regime: "breadth rising, ratio above 50dma, above 200dma, higher lows intact",
//   direction: "rising" | "falling" | "flat",
//   series: [{ t: 1722902400, ratio: 0.2833, dma50: ..., dma200: ... }, ...]  // ~1y daily
// }
// 502 → { error: "..." }  // Yahoo failed. Fail visibly: the tab shows an error
//                         // state and the scanners omit the regime line.

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' };

// Known levels from the Aug 2026 breadth analysis. Update as the chart evolves.
const LEVELS = { support: 0.2822, dma200Level: 0.2852, resistance: 0.2988 };

const CACHE_TTL_MS = 25_000;
let cache = { at: 0, payload: null };

async function fetchDaily(symbol) {
  // 1y of daily closes plus current regularMarketPrice for the live last point.
  const url = `${YAHOO}/${symbol}?range=1y&interval=1d&includePrePost=false`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const closes = res?.indicators?.quote?.[0]?.close;
  const ts = res?.timestamp;
  if (!Array.isArray(closes) || !Array.isArray(ts)) throw new Error(`Yahoo ${symbol}: malformed response`);
  const live = res?.meta?.regularMarketPrice ?? null;
  return { ts, closes, live };
}

function sma(arr, i, n) {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += arr[k];
  return s / n;
}

function buildPayload(rsp, spy) {
  // Align the two series on shared timestamps, skipping null closes.
  const spyByTs = new Map();
  spy.ts.forEach((t, i) => { if (spy.closes[i] != null) spyByTs.set(t, spy.closes[i]); });

  const t = [], ratio = [];
  rsp.ts.forEach((ts, i) => {
    const rc = rsp.closes[i], sc = spyByTs.get(ts);
    if (rc != null && sc != null) { t.push(ts); ratio.push(rc / sc); }
  });
  if (ratio.length < 60) throw new Error(`only ${ratio.length} aligned points`);

  // Replace the final bar with the live intraday ratio when both quotes exist.
  if (rsp.live != null && spy.live != null && spy.live !== 0) {
    ratio[ratio.length - 1] = rsp.live / spy.live;
  }

  const series = t.map((ts, i) => ({
    t: ts,
    ratio: +ratio[i].toFixed(5),
    dma50: sma(ratio, i, 50) != null ? +sma(ratio, i, 50).toFixed(5) : null,
    dma200: sma(ratio, i, 200) != null ? +sma(ratio, i, 200).toFixed(5) : null,
  }));

  const n = ratio.length - 1;
  const last = ratio[n];
  const dma50 = sma(ratio, n, 50);
  const dma200 = sma(ratio, n, 200);

  // Direction: 20-session change with a small dead zone.
  const chg = (last - ratio[Math.max(0, n - 20)]) / ratio[Math.max(0, n - 20)];
  const direction = chg > 0.003 ? 'rising' : chg < -0.003 ? 'falling' : 'flat';

  // Higher lows: rolling 20-session minimums over the last ~3 months, ascending.
  const lows = [];
  for (const end of [n - 40, n - 20, n]) {
    const start = Math.max(0, end - 19);
    if (start >= 0 && end > start) lows.push(Math.min(...ratio.slice(start, end + 1)));
  }
  const higherLows = lows.length === 3 && lows[0] < lows[1] && lows[1] < lows[2];

  const parts = [`breadth ${direction === 'flat' ? 'flat' : `wave ${direction === 'rising' ? 'up' : 'down'}`}`];
  if (dma50 != null) parts.push(`ratio ${last >= dma50 ? 'above' : 'below'} 50dma`);
  if (dma200 != null) parts.push(`${last >= dma200 ? 'above' : 'below'} 200dma`);
  if (higherLows) parts.push('higher lows intact');
  const regime = parts.join(', ');

  return {
    asOf: new Date().toISOString(),
    last: +last.toFixed(5),
    dma50: dma50 != null ? +dma50.toFixed(5) : null,
    dma200: dma200 != null ? +dma200.toFixed(5) : null,
    levels: LEVELS,
    regime,
    direction,
    series,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(cache.payload);
  }

  try {
    const [rsp, spy] = await Promise.all([fetchDaily('RSP'), fetchDaily('SPY')]);
    const payload = buildPayload(rsp, spy);
    cache = { at: Date.now(), payload };
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(payload);
  } catch (e) {
    // Yahoo's endpoint is unofficial. Fail loudly, never silently:
    // the tab renders an explicit error state and scanners skip the regime line.
    console.error('breadth fetch failed:', e.message);
    return res.status(502).json({ error: `breadth data unavailable: ${e.message}` });
  }
}
