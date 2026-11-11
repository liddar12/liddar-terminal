# liddar-terminal

Vite + React options terminal, deployed on Vercel. Serverless functions live in
`api/`; the UI lives in `src/`.

Owner sign-in is required before private panels, prediction data, or paid research
requests are available. Follow [owner authentication setup](docs/owner-auth-setup.md)
and `.env.example`. Missing Auth configuration keeps the app locked. Node 22 is
required by the pinned Supabase client. Trading storage uses the owner's verified
session, an explicit backend setting and the shared-project trading RPCs. No
project-wide database secret belongs in this terminal's storage configuration.

## Tabs

- **Breadth** — RSP/SPY breadth ratio from `/api/breadth`: 1y chart with 50/200dma
  overlays, support/resistance level lines, hover crosshair, and a regime badge.
  Polls every 30s. Fully wired and verified against live Yahoo data.
- **AI Calls / AI Puts** — options scanners that call `/api/claude` and inject the
  live breadth regime into the prompt (per `docs/breadth-integration.md` §2).
  The prompt and parsing helpers live in `src/scannerPrompt.js` and retain the
  production prompt structure captured in the November handoff. This is a
  research scanner; there is no order-execution route.

## API

- `api/breadth.js` — RSP/SPY ratio + regime string. No env vars, no deps. 25s cache.
  Fails loud (502) when Yahoo's unofficial endpoint misbehaves; the tab shows an
  error state and scanners omit the regime line.
- `api/claude.js` — proxy to the Anthropic Messages API. Keeps `ANTHROPIC_API_KEY`
  server-side. Owner-only `POST { messages, system?, max_tokens? }`; the server
  chooses the model and bounds the request size and output tokens.
- `api/session.js` — verifies the owner's Supabase Auth session.
- `api/log-prediction.js`, `api/predictions.js`, `api/scores.js` — owner-only
  append/read/scoring APIs for the isolated trading schema. Database receipt
  times come from the reviewed schema. NFL tables are never a fallback target.

## Local dev

```bash
npm install
# functions + static together (recommended):
vercel dev
# or Vite alone on :5173, proxying /api to `vercel dev` on :3000:
npm run dev
```

Configure owner Auth first (see `.env.example` and the setup guide). The market
data endpoints use no private key; the paid research secret remains server-side.

## Deploy

Vercel auto-detects the Vite framework and the `api/` functions. Use the intended
project, Node 22, and the staged setup/verification procedure in the owner-auth
guide. The current feature branch and deployment evidence are tracked in
[PR #13](https://github.com/liddar12/liddar-terminal/pull/13); a preview build does
not establish hosted owner or storage readiness.

## Related

- Self-learning / research spine (Python): [liddar12/SelfLearning](https://github.com/liddar12/SelfLearning).
  When live prediction logging turns on, predictions are stamped with the breadth
  regime block (`docs/breadth-integration.md` §3) so the scorer can split accuracy
  by regime. That's the data-contract seam between the two repos.
