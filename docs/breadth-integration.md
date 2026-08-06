# Breadth Integration: wiring guide for liddar-terminal

Two files to drop in, one small edit to the scanner prompt builders, one schema note for selflearn-core. Hand this whole folder to Claude Code with the repo open.

## Files in this package

- `api/breadth.js` → copy to the repo's `api/` folder, next to `api/claude.js`. No dependencies, no env vars. Verified against live Yahoo data on 2026-08-06: returned ratio 0.28475, 50dma 0.28454, 200dma 0.28519, regime "breadth flat, ratio above 50dma, below 200dma, higher lows intact". Those values line up with the levels from the RSP/SPY chart session (support 0.2822, 200dma ~0.2852, resistance 0.2988).
- `src/BreadthTab.jsx` → copy into the components folder and register as a tab the same way the existing tabs are registered.

## 1. Breadth tab

BreadthTab is self-contained: fetches `/api/breadth`, polls every 30s, renders a 1y ratio chart with 50/200dma overlays, support/resistance level lines, hover crosshair, and the regime string as a header badge.

Styling: it reads CSS custom properties with dark fallbacks (`--term-bg`, `--term-fg`, `--term-muted`, `--term-accent`, `--term-up`, `--term-down`). If the terminal already defines theme variables under different names, alias them at the top of the component (the `C` object). If the terminal uses a chart library (lightweight-charts, recharts), feel free to swap the SVG for it; the API payload has everything needed (`series[].ratio/dma50/dma200`, `levels`).

Failure mode is explicit by design: a 502 from the API renders "breadth data unavailable" (or a "showing last good data" banner if a refresh fails after a successful load). Do not add silent fallbacks.

## 2. Regime injection into AI Calls / AI Puts

In the scanner prompt builder (wherever the AI Calls / AI Puts prompt is assembled before the `api/claude.js` call), add:

```js
async function getRegimeLine() {
  try {
    const r = await fetch('/api/breadth');
    if (!r.ok) return '';                     // omit on failure, never fabricate
    const { regime } = await r.json();
    return regime ? `\nMarket breadth regime (RSP/SPY): ${regime}. ` +
      `Rising breadth favors equal-weight, healthcare, defense names; ` +
      `falling breadth favors cap-weighted mega-cap leaders.` : '';
  } catch { return ''; }
}
```

Append the returned string to the scanner prompt. Notes:

- If the prompt is assembled server-side inside `api/claude.js`, call the breadth logic directly there instead of fetching over HTTP (import the fetch/compute helpers from `api/breadth.js`, or hit `https://liddar-terminal.vercel.app/api/breadth`). The 25s in-memory cache makes either path cheap.
- The guidance sentence after the regime string is what lets Haiku act on it. Keep it to one line; it costs a few tokens.
- On breadth failure the scanners run exactly as they do today, with no regime line. That is the correct degradation.

## 3. selflearn-core schema note (next selflearn session)

Stamp every prediction at creation time with the regime state so the scorer can split accuracy by regime:

```json
{
  "breadth": {
    "direction": "rising | falling | flat",
    "vs50dma": "above | below",
    "vs200dma": "above | below",
    "ratio": 0.28475
  }
}
```

All four values come straight from the `/api/breadth` payload (`direction`, `last` vs `dma50`/`dma200`). Scoring dimension to add: hit rate and average return grouped by `direction` and by `vs200dma`, per scanner (calls vs puts). That makes the "stick with the wave" thesis measurable instead of asserted.

## Deferred (second pass)

- Client-side threshold-crossing alerts while the tab is open; server-side alerting needs cron.
- Ratio family strip (IWM/SPY, XLV/SPY, ITA/SPY, SMH/SPY): parameterize `api/breadth.js` with a `?pair=IWM,SPY` query and reuse the same compute path.

## Known risk

Yahoo's chart endpoint is unofficial and unauthenticated. It can rate-limit or change shape without notice. Everything downstream is built to fail visibly when that happens: 502 from the function, error state in the tab, regime line omitted from prompts. If it breaks permanently, the swap point is the `fetchDaily()` function, nothing else.
