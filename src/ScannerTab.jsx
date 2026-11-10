// src/ScannerTab.jsx
// AI Calls / AI Puts scanner.
//
// Prompt: the production V2 scanner prompt, recovered from the original
// deployment (see src/scannerPrompt.js). Market lines come from /api/quotes;
// a scan with no quotes is refused rather than letting the model guess prices.
// The live breadth regime is injected (docs/breadth-integration.md §2) and every
// idea is logged append-only to /api/log-prediction using the SelfLearning data
// contract, including the features.breadth regime stamp.

import { useState } from 'react';
import {
  CONFIDENCE,
  MODEL_VERSION,
  buildScannerPrompt,
  horizonSeconds,
  keepQuoted,
  parseIdeasJson,
} from './scannerPrompt.js';

async function getBreadth() {
  try {
    const r = await fetch('/api/breadth');
    if (!r.ok) return null; // omit on failure, never fabricate
    return await r.json();
  } catch {
    return null;
  }
}

// Regime line for the prompt (docs/breadth-integration.md §2).
function regimeLine(breadth) {
  if (!breadth?.regime) return '';
  return (
    `\nMarket breadth regime (RSP/SPY): ${breadth.regime}. ` +
    `Rising breadth favors equal-weight, healthcare, defense names; ` +
    `falling breadth favors cap-weighted mega-cap leaders.`
  );
}

// Regime stamp for the prediction record (docs/breadth-integration.md §3).
function breadthStamp(b) {
  if (!b || b.last == null || b.dma50 == null || b.dma200 == null || !b.direction) return null;
  return {
    direction: b.direction,
    vs50dma: b.last >= b.dma50 ? 'above' : 'below',
    vs200dma: b.last >= b.dma200 ? 'above' : 'below',
    ratio: Number(b.last.toFixed(5)),
  };
}

async function getQuotes(tickers) {
  const symbols = [...new Set([...tickers, 'SPY'])].join(',');
  const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `quotes HTTP ${r.status}`);
  return j; // { quotes, errors }
}

async function logIdeas(side, ideas, breadth) {
  const stamp = breadthStamp(breadth);
  const now = Math.floor(Date.now() / 1000);
  const results = await Promise.allSettled(
    ideas.map((idea) =>
      fetch('/api/log-prediction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          ts: now,
          model_version: MODEL_VERSION,
          task: 'scanner',
          features: stamp ? { breadth: stamp } : {},
          prediction: {
            side: side === 'puts' ? 'put' : 'call',
            symbol: idea.ticker,
            entry_price: idea.currentPrice,
            strike: idea.strike,
            expiry: idea.expiry,
            est_premium: idea.estimatedPremium,
            target: idea.targetPrice,
            stop: idea.stopLevel,
            thesis: idea.thesis,
          },
          confidence: CONFIDENCE[idea.confidence],
          horizon_s: horizonSeconds(idea),
          cohort: idea.ticker,
        }),
      }).then((r) => {
        if (r.status === 503) throw new Error('unconfigured');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
    )
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const unconfigured = results.some(
    (r) => r.status === 'rejected' && r.reason?.message === 'unconfigured'
  );
  return { ok, total: ideas.length, unconfigured };
}

const CONVICTION_CLASS = {
  HIGH: 'text-term-up border-term-up',
  MEDIUM: 'text-term-accent border-term-accent',
  LOW: 'text-term-muted border-term-grid',
};

const px = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');

export default function ScannerTab({ side }) {
  const [tickers, setTickers] = useState('NVDA, MSFT, XOM, EQT, BAC, GLD, TLT');
  const [out, setOut] = useState(null); // {ideas?, raw?, regimeUsed, logged?}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const list = tickers
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (!list.length) throw new Error('enter at least one ticker');
      const [breadth, q] = await Promise.all([getBreadth(), getQuotes(list)]);
      const quoted = list.filter((t) => q.quotes[t]);
      if (!quoted.length) throw new Error('no quotes for these tickers; not scanning without prices');
      const line = regimeLine(breadth);
      const prompt = buildScannerPrompt(side, quoted, q.quotes, line);
      const r = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const text = (j.content || []).map((b) => b.text || '').join('').trim();
      const parsed = parseIdeasJson(text);
      const ideas = parsed ? keepQuoted(parsed, q.quotes) : null;
      const skipped = Object.keys(q.errors || {});
      const result = { ideas, raw: ideas ? null : text, regimeUsed: !!line, logged: null, skipped };
      setOut(result);
      if (ideas?.length) {
        const logged = await logIdeas(side, ideas, breadth);
        setOut({ ...result, logged });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = side === 'puts' ? 'AI Puts' : 'AI Calls';

  return (
    <div className="rounded-md bg-term-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[15px] font-semibold text-term-fg">{title}</span>
        <span className="rounded border border-term-grid px-1.5 py-0.5 text-[11px] text-term-muted">
          production prompt · logs to selflearn store
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          placeholder="comma-separated tickers"
          className="min-w-[240px] flex-1 rounded border border-term-grid bg-transparent px-2.5 py-1.5 text-[13px] text-term-fg outline-none focus:border-term-accent"
        />
        <button
          onClick={run}
          disabled={busy}
          className={
            'rounded border px-3.5 py-1.5 text-[13px] transition-colors ' +
            (busy
              ? 'cursor-default border-term-grid text-term-muted'
              : 'border-term-accent text-term-accent hover:bg-term-accent/10')
          }
        >
          {busy ? 'scanning…' : 'run scan'}
        </button>
      </div>

      {error && <div className="mb-2 text-xs text-term-down">scan failed: {error}</div>}

      {out && (
        <>
          <div className="mb-2 flex flex-wrap gap-3 text-[11px]">
            {out.skipped?.length > 0 && (
              <span className="text-term-down">no quote, skipped: {out.skipped.join(', ')}</span>
            )}
            <span className={out.regimeUsed ? 'text-term-up' : 'text-term-muted'}>
              {out.regimeUsed
                ? 'breadth regime injected into prompt'
                : 'breadth unavailable — regime line omitted'}
            </span>
            {out.logged &&
              (out.logged.unconfigured ? (
                <span className="text-term-muted">predictions not logged — storage not configured</span>
              ) : (
                <span className="text-term-up">
                  logged {out.logged.ok}/{out.logged.total} predictions (horizon = expiry)
                </span>
              ))}
          </div>

          {out.ideas ? (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-term-grid text-left text-[11px] text-term-muted">
                  <th className="py-1.5 pr-3 font-normal">ticker</th>
                  <th className="py-1.5 pr-3 font-normal">price</th>
                  <th className="py-1.5 pr-3 font-normal">strike / expiry</th>
                  <th className="py-1.5 pr-3 font-normal">target / stop</th>
                  <th className="py-1.5 pr-3 font-normal">thesis</th>
                  <th className="py-1.5 font-normal">confidence</th>
                </tr>
              </thead>
              <tbody>
                {out.ideas.map((idea, idx) => (
                  <tr key={`${idea.ticker}-${idx}`} className="border-b border-term-grid/50">
                    <td className="py-2 pr-3 font-semibold text-term-fg">{idea.ticker}</td>
                    <td className="py-2 pr-3 text-term-fg/90">{px(idea.currentPrice)}</td>
                    <td className="py-2 pr-3 text-term-fg/90">
                      {px(idea.strike)} · {idea.expiry || '—'}
                    </td>
                    <td className="py-2 pr-3 text-term-fg/90">
                      {px(idea.targetPrice)} / {px(idea.stopLevel)}
                    </td>
                    <td className="py-2 pr-3 text-term-fg/90">{idea.thesis}</td>
                    <td className="py-2">
                      <span
                        className={
                          'rounded border px-1.5 py-0.5 text-[11px] ' + CONVICTION_CLASS[idea.confidence]
                        }
                      >
                        {idea.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            out.raw && (
              <pre className="m-0 whitespace-pre-wrap break-words text-[13px] text-term-fg">{out.raw}</pre>
            )
          )}
        </>
      )}

      {!out && !error && (
        <p className="text-[13px] text-term-muted">
          Enter a watchlist and run a scan. Live quotes and the RSP/SPY breadth regime go into the
          production prompt, and every idea is logged as an append-only prediction (with the regime
          stamp) for scoring.
        </p>
      )}
    </div>
  );
}
