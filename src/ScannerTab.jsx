// src/ScannerTab.jsx
// AI Calls / AI Puts scanner.
//
// SCAFFOLD NOTE: the production scanner prompt from the original liddar-terminal
// app is not in this repo. This tab is a working stand-in — it fetches the live
// breadth regime, injects it exactly as docs/breadth-integration.md §2 prescribes,
// sends the prompt to /api/claude, and renders the reply. Replace
// buildScannerPrompt() with the real scanner logic when it's available; the
// breadth wiring (getRegimeLine) is production-ready and should stay as-is.

import { useState } from 'react';

// From docs/breadth-integration.md §2 — omit on failure, never fabricate.
async function getRegimeLine() {
  try {
    const r = await fetch('/api/breadth');
    if (!r.ok) return '';
    const { regime } = await r.json();
    return regime
      ? `\nMarket breadth regime (RSP/SPY): ${regime}. ` +
          `Rising breadth favors equal-weight, healthcare, defense names; ` +
          `falling breadth favors cap-weighted mega-cap leaders.`
      : '';
  } catch {
    return '';
  }
}

// Placeholder prompt — swap for the production scanner prompt.
function buildScannerPrompt(side, tickers, regimeLine) {
  return (
    `You are an options scanner. From this watchlist, pick the strongest ` +
    `${side === 'puts' ? 'PUT' : 'CALL'} candidates: ${tickers}. ` +
    `For each, give: ticker, a one-line thesis, and conviction (low/med/high). ` +
    `Keep it tight.` +
    regimeLine
  );
}

export default function ScannerTab({ side }) {
  const [tickers, setTickers] = useState('NVDA, MSFT, XOM, EQT, BAC, GLD, TLT');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const regimeLine = await getRegimeLine();
      const prompt = buildScannerPrompt(side, tickers, regimeLine);
      const r = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const text = (j.content || []).map((b) => b.text || '').join('').trim();
      setOut({ text, regimeUsed: !!regimeLine.trim() });
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
          scaffold — wired to /api/claude + breadth regime
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
          <div className={'mb-1.5 text-[11px] ' + (out.regimeUsed ? 'text-term-up' : 'text-term-muted')}>
            {out.regimeUsed
              ? 'breadth regime injected into prompt'
              : 'breadth unavailable — regime line omitted'}
          </div>
          <pre className="m-0 whitespace-pre-wrap break-words text-[13px] text-term-fg">{out.text}</pre>
        </>
      )}

      {!out && !error && (
        <p className="text-[13px] text-term-muted">
          Enter a watchlist and run a scan. The live RSP/SPY breadth regime is injected into the prompt
          automatically when available.
        </p>
      )}
    </div>
  );
}
