// src/scannerPrompt.js
// Production AI Calls / AI Puts prompt, recovered verbatim (structure and
// wording) from the original V2 terminal bundle served at
// liddar-terminal.vercel.app (index-DADP-qpz.js, March 2026, the Haiku-tuned
// compact version), plus the breadth regime line. Pure functions so they are
// testable with `node --test`.
//
// Differences from the original, on purpose:
// - Market lines come from /api/quotes (server-side Yahoo) instead of Finnhub
//   keys in the browser. Alpha Vantage fundamentals (PE, margin, beta) are not
//   included until a server-side fundamentals endpoint exists.
// - The live RSP/SPY regime line is appended (docs/breadth-integration.md §2).
// - Tickers without a quote are dropped, never sent without a price.

export const MODEL_VERSION = 'scanner-v2.0-prod-prompt@haiku';
export const CONFIDENCE = { HIGH: 0.65, MEDIUM: 0.5, LOW: 0.35 };

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—');

export function stockLines(tickers, quotes) {
  return tickers
    .filter((t) => quotes[t])
    .map((t) => {
      const q = quotes[t];
      return `${t} $${fmt(q.c)} ${q.dp >= 0 ? '+' : ''}${fmt(q.dp)}% trend:${q.trend}`;
    })
    .join('\n');
}

export function buildScannerPrompt(side, tickers, quotes, regime = '', now = new Date()) {
  const month = now.toLocaleString('en-US', { month: 'long' });
  const weekday = now.toLocaleString('en-US', { weekday: 'short' });
  const spy = quotes.SPY || {};
  const kind = side === 'puts' ? 'PUT' : 'CALL';
  const focus =
    side === 'puts'
      ? 'bearish: downtrends, negative catalysts, overbought reversals, broken support'
      : 'bullish: uptrends, positive catalysts, breakouts, oversold bounces';
  const universe = tickers.filter((t) => t !== 'SPY' || tickers.length === 1);
  return `Options analyst scan. ${kind}s only. Date: ${weekday} ${month} ${now.getDate()} ${now.getFullYear()}. Market: SPY $${fmt(spy.c)} ${spy.dp >= 0 ? '+' : ''}${fmt(spy.dp)}%.${regime}

STOCKS:
${stockLines(universe, quotes)}

Find top 5 ${kind} opportunities. Focus on ${focus}.
Analyze technicals, fundamentals, sentiment, seasonality, volatility.

RESPOND ONLY IN JSON (no markdown, no backticks, no text before/after):
[{"rank":1,"ticker":"AAPL","companyName":"Apple","currentPrice":178.72,"confidence":"HIGH","strike":180.00,"expiry":"2026-04-17","estimatedPremium":2.50,"targetPrice":190.00,"stopLevel":174.00,"maxGainPct":300,"riskRewardRatio":"3.2:1","thesis":"2 sentences max","catalysts":["c1","c2"],"risks":["r1","r2"],"technicalSignal":"STRONG BUY","sentimentScore":0.75,"timingNote":"entry note"}]

Return exactly 5 results. Realistic strikes near current price. Expiries 2-6 weeks out. Not financial advice.`;
}

// Same recovery logic as the V2 scanner: strip fences, try a clean parse, then
// salvage a truncated array up to the last complete object.
export function parseIdeasJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const body = start >= 0 ? cleaned.slice(start) : cleaned;
  let arr = null;
  try {
    arr = JSON.parse(body);
  } catch {
    const end = body.lastIndexOf('}');
    if (end > 0) {
      const cut = body.substring(0, end + 1);
      try {
        arr = JSON.parse(cut + ']');
      } catch {
        try {
          arr = JSON.parse('[' + cut + ']');
        } catch {
          arr = null;
        }
      }
    }
  }
  if (!Array.isArray(arr)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return arr
    .filter((x) => x && typeof x.ticker === 'string')
    .map((x) => {
      const conf = String(x.confidence || '').toUpperCase();
      return {
        ticker: x.ticker.toUpperCase(),
        confidence: CONFIDENCE[conf] != null ? conf : 'MEDIUM',
        currentPrice: num(x.currentPrice),
        strike: num(x.strike),
        expiry: typeof x.expiry === 'string' ? x.expiry : null,
        estimatedPremium: num(x.estimatedPremium),
        targetPrice: num(x.targetPrice),
        stopLevel: num(x.stopLevel),
        riskRewardRatio: typeof x.riskRewardRatio === 'string' ? x.riskRewardRatio : null,
        thesis: String(x.thesis ?? ''),
        catalysts: Array.isArray(x.catalysts) ? x.catalysts.map(String) : [],
        risks: Array.isArray(x.risks) ? x.risks.map(String) : [],
      };
    });
}

// Ideas whose ticker was not in the quoted universe are dropped: the model must
// not introduce symbols we did not give it a price for.
export function keepQuoted(ideas, quotes) {
  return (ideas || []).filter((i) => quotes[i.ticker]);
}

// Horizon: resolve at the option's expiry when given (2-6 weeks per the prompt),
// else one week. Bounded to [1 day, 60 days].
export function horizonSeconds(idea, nowMs = Date.now()) {
  const week = 7 * 86_400;
  if (!idea.expiry) return week;
  const t = Date.parse(`${idea.expiry}T21:00:00Z`);
  if (!Number.isFinite(t)) return week;
  const s = Math.round((t - nowMs) / 1000);
  return Math.min(Math.max(s, 86_400), 60 * 86_400);
}
