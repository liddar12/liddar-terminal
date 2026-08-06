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

const C = {
  fg: 'var(--term-fg, #d8dee9)',
  muted: 'var(--term-muted, #6b7280)',
  accent: 'var(--term-accent, #e8b64c)',
  up: 'var(--term-up, #4cc38a)',
  down: 'var(--term-down, #e5534b)',
  grid: 'var(--term-grid, #1f2430)',
};

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
    <div style={{ background: 'var(--term-bg, #0b0e14)', padding: 16, borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ color: C.fg, fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span
          style={{
            color: C.muted,
            fontSize: 11,
            border: `1px solid ${C.grid}`,
            borderRadius: 3,
            padding: '2px 6px',
          }}
        >
          scaffold — wired to /api/claude + breadth regime
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          placeholder="comma-separated tickers"
          style={{
            flex: 1,
            minWidth: 240,
            background: 'transparent',
            color: C.fg,
            border: `1px solid ${C.grid}`,
            borderRadius: 4,
            padding: '6px 10px',
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
        <button
          onClick={run}
          disabled={busy}
          style={{
            background: 'transparent',
            color: busy ? C.muted : C.accent,
            border: `1px solid ${busy ? C.grid : C.accent}`,
            borderRadius: 4,
            padding: '6px 14px',
            fontFamily: 'inherit',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'scanning…' : 'run scan'}
        </button>
      </div>

      {error && <div style={{ color: C.down, fontSize: 12, marginBottom: 8 }}>scan failed: {error}</div>}

      {out && (
        <>
          <div style={{ color: out.regimeUsed ? C.up : C.muted, fontSize: 11, marginBottom: 6 }}>
            {out.regimeUsed ? 'breadth regime injected into prompt' : 'breadth unavailable — regime line omitted'}
          </div>
          <pre
            style={{
              color: C.fg,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {out.text}
          </pre>
        </>
      )}

      {!out && !error && (
        <div style={{ color: C.muted, fontSize: 13 }}>
          Enter a watchlist and run a scan. The live RSP/SPY breadth regime is injected into the
          prompt automatically when available.
        </div>
      )}
    </div>
  );
}
