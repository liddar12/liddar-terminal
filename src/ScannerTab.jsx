// src/ScannerTab.jsx
// AI Calls / AI Puts scanner.
//
// SCAFFOLD NOTE: the production scanner prompt from the original liddar-terminal
// app is not in this repo. buildScannerPrompt() below is a working placeholder —
// swap in the real prompt wording when available. Everything around it is
// production wiring: live breadth regime injection (docs/breadth-integration.md
// §2), strict-JSON idea output, and append-only prediction logging to
// /api/log-prediction using the SelfLearning data contract (incl. the
// features.breadth regime stamp).

import { useState } from 'react';

const HORIZON_S = 7 * 86_400; // resolve ideas against the move over one week
const CONFIDENCE = { low: 0.35, med: 0.5, high: 0.65 };
const MODEL_VERSION = 'scanner-scaffold@v1';

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

// Placeholder prompt — swap for the production scanner prompt. The strict-JSON
// output contract below should survive that swap so logging keeps working.
function buildScannerPrompt(side, tickers, line) {
  return (
    `You are an options scanner. From this watchlist, pick the strongest ` +
    `${side === 'puts' ? 'PUT' : 'CALL'} candidates: ${tickers}.` +
    line +
    `\n\nRespond with ONLY a JSON array, no prose, of at most 5 objects: ` +
    `[{"ticker": "...", "thesis": "one line", "conviction": "low|med|high"}]`
  );
}

function parseIdeas(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((x) => x && typeof x.ticker === 'string')
      .map((x) => ({
        ticker: x.ticker.toUpperCase(),
        thesis: String(x.thesis ?? ''),
        conviction: ['low', 'med', 'high'].includes(x.conviction) ? x.conviction : 'med',
      }));
  } catch {
    return null;
  }
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
          prediction: { side: side === 'puts' ? 'put' : 'call', symbol: idea.ticker, thesis: idea.thesis },
          confidence: CONFIDENCE[idea.conviction],
          horizon_s: HORIZON_S,
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
  high: 'text-term-up border-term-up',
  med: 'text-term-accent border-term-accent',
  low: 'text-term-muted border-term-grid',
};

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
      const breadth = await getBreadth();
      const line = regimeLine(breadth);
      const prompt = buildScannerPrompt(side, tickers, line);
      const r = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const text = (j.content || []).map((b) => b.text || '').join('').trim();
      const ideas = parseIdeas(text);
      const result = { ideas, raw: ideas ? null : text, regimeUsed: !!line, logged: null };
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
          scaffold prompt · logs to selflearn store
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
                  logged {out.logged.ok}/{out.logged.total} predictions (7d horizon)
                </span>
              ))}
          </div>

          {out.ideas ? (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-term-grid text-left text-[11px] text-term-muted">
                  <th className="py-1.5 pr-3 font-normal">ticker</th>
                  <th className="py-1.5 pr-3 font-normal">thesis</th>
                  <th className="py-1.5 font-normal">conviction</th>
                </tr>
              </thead>
              <tbody>
                {out.ideas.map((idea) => (
                  <tr key={idea.ticker} className="border-b border-term-grid/50">
                    <td className="py-2 pr-3 font-semibold text-term-fg">{idea.ticker}</td>
                    <td className="py-2 pr-3 text-term-fg/90">{idea.thesis}</td>
                    <td className="py-2">
                      <span
                        className={
                          'rounded border px-1.5 py-0.5 text-[11px] ' + CONVICTION_CLASS[idea.conviction]
                        }
                      >
                        {idea.conviction}
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
          Enter a watchlist and run a scan. The live RSP/SPY breadth regime is injected into the prompt,
          and every idea is logged as an append-only prediction (with the regime stamp) for scoring.
        </p>
      )}
    </div>
  );
}
