# Solution Architecture

System-level architecture for the liddar-ai platform. Scope: how the three workstreams fit together, the business drivers, and the runtime shape of the web-based execution app. Concrete tech choices and data contracts live in `tech-design.md`.

Status labels per `fable-mode`: **[verified]** confirmed from repo/docs, **[inferred]** design choice, **[VERIFY]** must confirm against provider docs before building.

---

## 1. Business drivers → architectural response

The drivers Jimmy named, each mapped to the architecture decision it forces. Ordered by priority; when two drivers conflict, the higher one wins.

| Driver | What it demands | Architectural response |
|---|---|---|
| **Accuracy** | Never place an unintended order; system state must match the broker. | Idempotent OMS with client-order keys; a reconciliation loop where broker state is the source of truth; single execution code path for sim and live. |
| **Profitability** | Objective is EV net of commission, slippage, and tax — not gross hit rate. | Cost/slippage model in the sizing decision; `selflearn-core` scores net PnL; TLH engine folds tax into the objective. |
| **Tax-loss harvesting** | Realize losses to offset gains without tripping wash-sale rules. | Lot-level ledger, wash-sale guard in the pre-trade gate, harvest-opportunity finder, short/long-term aware. First-class subsystem. |
| **Latency / speed** | Sub-second reaction to signals and quotes; non-blocking order flow. | Event-driven core over a message bus; streamed quotes (WebSocket); async I/O; hot state in memory/Redis; latency budgets per stage. |
| **Iteration speed** | Backtests must predict live behavior. | Sim and live share the `Broker` and `OMS` abstractions; only the adapter behind them changes. |

### Latency reality check [VERIFY]
True HFT (microsecond, colocation, direct market access, FIX) is **not available on a retail Schwab account**, and the Liddar options ideas are daily/intraday swing signals, not high-frequency. The target is a **low-latency, event-driven** system: react to a streamed quote or a fresh signal in well under a second, place orders asynchronously, and never block the event loop on network I/O. We design and measure to that target and do not claim HFT. Confirm Schwab Trader API rate limits, streaming coverage, and the absence of a paper-trading sandbox before wiring.

---

## 2. Component map

```
                         ┌───────────────────────────────────────────────┐
                         │            Liddar Terminal (web)               │
                         │   Next.js / React on Vercel  [verified stack]  │
                         │   tabs: AI Calls · AI Puts · Scores · Execution │
                         └───────▲──────────────────────────▲─────────────┘
                                 │ JSON/HTTP + SSE/WS        │
                     read scores │                           │ approve/kill (human-in-loop)
                                 │                           │
                    ┌────────────┴───────────┐   ┌───────────┴──────────────┐
                    │   Results API (FastAPI) │   │  Execution API (FastAPI) │
                    │   read-only over core   │   │  order intent + control  │
                    └────────────┬───────────┘   └───────────┬──────────────┘
                                 │                            │
          ┌──────────────────────┴───────┐        ┌──────────┴───────────────────────────┐
          │        selflearn-core         │        │           Execution engine            │
          │  store · scoring · registry   │        │  signal→intent · risk gate · OMS ·    │
          │  updater(L0..L4) · adapters   │◄───────┤  TLH engine · lot ledger · reconciler │
          │        (Python)               │ scores │                (Python)               │
          └──────┬─────────────┬──────────┘        └──────────────────┬────────────────────┘
                 │             │                                       │
     ┌───────────┴──┐   ┌──────┴────────────┐              ┌───────────┴───────────┐
     │ Scanner      │   │ Power backtest    │              │  Schwab Trader API     │
     │ Adapter      │   │ Adapter (H1..H4)  │              │  OAuth · REST · WS     │
     │ (Liddar AI)  │   │ EIA/ISO/gas data  │              │  [VERIFY surface]      │
     └──────────────┘   └───────────────────┘              └────────────────────────┘
```

- **selflearn-core** is the hub. Scanner and backtest write predictions in; the execution engine reads scores out. [inferred]
- **Execution engine** only acts on signals the core has scored as edge-positive net of cost and tax. It never trades a raw, unscored signal. [inferred]
- **Two API surfaces** are deliberately separate: a read-only Results API (safe, cacheable) and a control-plane Execution API (authenticated, audited, rate-limited). [inferred]

---

## 3. Data flow

### Prediction → outcome → score (the spine)
1. A producer (scanner or backtest) makes a prediction and writes it to the append-only store with everything known at prediction time.
2. When the horizon elapses, the resolver fetches the realized outcome and attaches it. No lookahead: the resolver is the only component allowed to read post-prediction data.
3. The scorer computes per-task, per-cohort metrics on resolved predictions only.
4. The registry records each model config's live score; the updater proposes changes within its autonomy level.

### Signal → order → fill → reconcile (execution)
1. Execution engine subscribes to newly scored, edge-positive signals from the core.
2. The self-learning layer emits **Low / Medium / High** recommendations for the
   signal (`selflearn_core.recommend`), each carrying three separate lenses:
   backtested performance (history), a forward estimate (projection + interval),
   and live calibrated confidence. Confidence gates which tiers are offered.
3. A tier is chosen → **order intent** (symbol, side, quantity sized within the
   tier's cap, order type). Tier limits feed the risk gate; they don't bypass it.
3. Intent passes the **pre-trade risk gate** (Section 5) including the wash-sale guard. Reject or proceed.
4. OMS assigns a client-order key and routes to the `Broker` (sim or Schwab). Idempotent: a retry with the same key never double-sends.
5. Fills stream back; the lot ledger and positions update.
6. The reconciler compares internal state to the broker every cycle; any divergence halts trading and alerts.
7. Every fill becomes a resolved outcome fed back to the core (closing the learning loop on live trades).

---

## 4. Tax-loss harvesting subsystem

TLH is a named business driver, so it is a first-class subsystem, not a report. [inferred]

- **Lot ledger**: every open position tracked at the tax-lot level (acquisition date, cost basis, quantity, symbol). Specific-identification method so we can choose which lots to sell. [VERIFY Schwab lot/cost-basis reporting support]
- **Harvest finder**: scans lots for unrealized losses that exceed a configurable threshold and would produce a useful offset given the account's realized-gain position and short/long-term split.
- **Wash-sale guard**: before any buy or any harvest sell, checks the 30-day window (before and after) for substantially-identical purchases — including replacement securities and options on the same underlying — and blocks trades that would disallow the loss. This guard is inside the pre-trade gate, so it constrains ordinary signal trades too, not just deliberate harvests. [VERIFY exact wash-sale treatment for options]
- **Replacement selection**: when harvesting, optionally rotate into a not-substantially-identical proxy to keep market exposure without tripping the rule.
- **Objective coupling**: realized tax effect feeds the net-EV objective the sizer and the core optimize, so a "winning" gross idea that creates a bad tax outcome is scored honestly.

TLH is **advisory in early gates** (proposes harvests for human approval) and only becomes automated behind the same staged-autonomy gate as everything else.

---

## 5. Risk and safety architecture

Safety is structural, not procedural. The only path from a signal to the broker runs through the gate; there is no bypass. [inferred]

- **Pre-trade gate** (all checks must pass): position-size cap, aggregate exposure cap, daily-loss cap → session kill switch, buying-power/margin check, wash-sale guard, symbol allowlist, idempotency key present.
- **Reconciliation loop**: broker is truth. Divergence between internal and broker state halts trading and raises an alert rather than trying to "fix" itself silently.
- **Kill switch**: reachable from the terminal and triggered automatically by the daily-loss cap or by a reconciliation divergence.
- **Staged autonomy** (mirrors the updater levels): read-only → simulated → human-approves-each → auto-within-limits. Each promotion is a manual gate with a verified track record behind it.
- **Audit log**: every decision (signal seen, intent formed, gate result, order sent, fill, reconciliation) is appended immutably. Serves compliance and feeds the learning loop.
- **Secrets**: Schwab OAuth tokens and API keys live in a secrets store / env, never in the repo; tokens refresh on schedule. [inferred]

---

## 6. Deployment topology [inferred]

- **Web terminal**: Vercel (matches the existing Liddar Terminal). Static + serverless; talks to the two APIs over HTTPS + SSE/WebSocket. [verified existing terminal is on Vercel]
- **selflearn-core + APIs**: a small Python service (FastAPI). Local/SQLite for solo dev; Supabase/Postgres when hosted. [inferred]
- **Execution engine**: long-running Python process (it holds a WebSocket to Schwab and in-memory hot state). Not serverless — serverless cannot hold a persistent broker connection or the event loop. This is the one always-on component. [inferred, VERIFY hosting choice]
- **Data stores**: append-only prediction log + resolved outcomes (SQLite→Postgres), time series (Parquet/Timescale), lot ledger and audit log (durable, transactional). See `tech-design.md`.

The cross-language boundary stays small: the terminal fetches JSON; it never imports Python. The execution control plane is authenticated and audited separately from the read-only results plane.

---

## 7. Open architecture questions (`TODO(jimmy)` / `VERIFY`)

- [VERIFY] Schwab Trader API: OAuth flow, rate limits, streaming coverage, order types, lot/cost-basis support, confirmation of no paper sandbox.
- [VERIFY] PDT and options-approval constraints for the target account.
- `TODO(jimmy)` hosting for the always-on execution engine (home box, a VM, a managed container?).
- `TODO(jimmy)` Supabase vs local Postgres for the durable stores.
- [inferred] whether the Results API and Execution API are one service or two — start as one FastAPI app with two routers, split later if load or security demands.
