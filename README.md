# liddar-terminal

Vite + React options terminal, deployed on Vercel. Serverless functions live in
`api/`; the UI lives in `src/`.

## Tabs

- **Breadth** — RSP/SPY breadth ratio from `/api/breadth`: 1y chart with 50/200dma
  overlays, support/resistance level lines, hover crosshair, and a regime badge.
  Polls every 30s. Fully wired and verified against live Yahoo data.
- **AI Calls / AI Puts** — options scanners that call `/api/claude` and inject the
  live breadth regime into the prompt (per `docs/breadth-integration.md` §2).
  **Scaffold:** the original production scanner prompt is not in this repo, so
  `buildScannerPrompt()` in `src/ScannerTab.jsx` is a working placeholder. Drop the
  real prompt in there — the breadth wiring (`getRegimeLine`) is production-ready.

## API

- `api/breadth.js` — RSP/SPY ratio + regime string. No env vars, no deps. 25s cache.
  Fails loud (502) when Yahoo's unofficial endpoint misbehaves; the tab shows an
  error state and scanners omit the regime line.
- `api/claude.js` — proxy to the Anthropic Messages API. Keeps `ANTHROPIC_API_KEY`
  server-side. `POST { messages, system?, model?, max_tokens? }`.

## Local dev

```bash
npm install
# functions + static together (recommended):
vercel dev
# or Vite alone on :5173, proxying /api to `vercel dev` on :3000:
npm run dev
```

Set `ANTHROPIC_API_KEY` (see `.env.example`) for the scanner tabs. The Breadth tab
needs no key.

## Deploy

Vercel auto-detects the Vite framework and the `api/` functions. Set
`ANTHROPIC_API_KEY` in the project's environment variables.

## Related

- Self-learning / research spine (Python): [liddar12/SelfLearning](https://github.com/liddar12/SelfLearning).
  When live prediction logging turns on, predictions are stamped with the breadth
  regime block (`docs/breadth-integration.md` §3) so the scorer can split accuracy
  by regime. That's the data-contract seam between the two repos.
