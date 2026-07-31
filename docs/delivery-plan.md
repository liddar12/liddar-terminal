# Delivery Plan: Epics, Stories, Tasks, Acceptance Criteria

Single-user, high-speed, GitHub-native app. Epics map to the gates in
`power2026-build.md` §7. "You" = Jimmy (the single user). Status: ✅ done ·
🟡 in progress · ⬜ not started. Every story has acceptance criteria (AC); QA
scripts that regress against them live in `qa-regression.md`.

Architecture in one line: **self-learning spine (Python, dep-free, reusable) ←
adapters → { scanner, power backtest, execution }**, terminal reads over JSON,
execution engine is a containerized always-on Python service in front of a
broker-agnostic port.

---

## E1 · Self-learning spine ✅ (Gate 1–3 core)

**Story 1.1** — As the system, I log every prediction append-only so nothing is
predicted-and-forgotten.
- Tasks: `Prediction`/`Outcome` types; `StorageBackend`; `SqliteStore` CRUD; schema.
- AC: a prediction persists and reloads intact; features never reference data after `ts`. ✅

**Story 1.2** — As the user, I score signals honestly by cohort and horizon.
- Tasks: `Score` with `n`+CI; horizons 1d..max; `run_*_multi`.
- AC: scores carry sample size + interval; horizons too large for history are **skipped, not dropped**. ✅

**Story 1.3** — As the user, I get Low/Med/High recommendations that separate
backtest, forward estimate, and live confidence.
- Tasks: `recommend.py` (`BacktestView`, `ForwardView`, `TierPolicy`, `build_recommendations`).
- AC: a tier is offered only when live confidence clears its floor; three lenses never merged. ✅

---

## E2 · Power research (H1..H4) 🟡 (Gate 2–3)

**Story 2.1** — As a researcher, I test "gas sets the price" walk-forward per ISO.
- Tasks: EIA + ISO clients (network-isolated); `align`; OLS; `run_h1`.
- AC: recovers implied heat rate + R²; PASS iff slope in band 6–12; no train/test overlap. ✅ (logic) / 🟡 (live data blocked on egress)

**Story 2.2** — As a researcher, I run H2–H4 with published acceptance checks.
- Tasks: duck-curve, negative-pricing, merit-order harnesses + adapters.
- AC: each emits a pass/fail with the evidence named in `power2026-build.md` §3. ⬜

---

## E3 · Broker-agnostic execution core ✅ (foundation for Gate 5–7)

**Story 3.1** — As the system, I place orders through one port so brokers are swappable.
- Tasks: `Broker` port; domain types; `SimBroker`; Schwab/Alpaca/Robinhood adapters.
- AC: all adapters satisfy the same interface; `official_api` flag exposed; Robinhood flagged unofficial. ✅

**Story 3.2** — As the user, no unintended or duplicate order can reach a broker.
- Tasks: pure `risk.check`; idempotent `OMS`.
- AC: every rejection returns a specific reason; a repeated `client_key` never double-sends. ✅

**Story 3.3** — As the user, I can "paper trade" with realistic fills.
- Tasks: `SimBroker` fills at the touch + slippage; unmarketable limits don't fill.
- AC: sim and live share the exact `Broker` interface. ✅

---

## E4 · Schwab integration ⬜ (Gate 5–7)

**Story 4.1** — As the user, I connect Schwab read-only and reconcile.
- Tasks: OAuth + token refresh; `SchwabBroker` reads; reconciliation loop.
- AC: positions/balances/orders match Schwab; any divergence halts trading + alerts. ⬜ (needs your Schwab dev app)

**Story 4.2** — As the user, I approve each live order behind hard limits.
- Tasks: Execution API (approve/kill/positions); wire risk gate + TLH server-side.
- AC: no order leaves without passing the gate; kill switch halts instantly. ⬜

**Story 4.3** — As the user, my losses can't be harvested into a wash sale.
- Tasks: lot ledger; harvest finder; wash-sale guard inside the gate.
- AC: an order that would void a harvested loss is rejected with reason. ⬜ (designed)

---

## E5 · Terminal (web) 🟡

**Story 5.1** — As the user, I see live scores, backtests, recommendations, and
an execution panel in the terminal.
- Tasks: JSON read API (`/scores`, `/configs`, `/predictions`); views; execution control plane.
- AC: terminal never imports Python; execution controls are authenticated + audited. 🟡 (mockup shipped; API ⬜)

---

## E6 · Always-on engine + ops ⬜

**Story 6.1** — As the user, the engine runs continuously and holds the broker socket.
- Tasks: containerize (Dockerfile); deploy to a managed host (Fly/Railway/Render); secrets via env.
- AC: engine restarts cleanly; tokens refresh; secrets never in the repo. ⬜ (Dockerfile scaffolded)

---

## E7 · Reuse & packaging ⬜/🟡

**Story 7.1** — As other projects, I can consume `selflearn-core` / `signals` standalone.
- Tasks: keep zero third-party deps; stable public API; version + (later) publish.
- AC: both packages import with no third-party installs; no app-specific imports leak in. ✅ (structure) / ⬜ (publish)

---

## Priority order

E1 ✅ → E3 ✅ → **E2 live** (unblock egress) → E4 (needs Schwab app) → E5 API →
E6 deploy → E7 publish. Each epic gated; nothing trades real money before E4.3 +
E6 are green and a signal has a verified edge.
