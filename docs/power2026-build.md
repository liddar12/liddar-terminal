# Power 2026 + Liddar: Self-Learning Core, Research Backtests, and Execution

Living build brief for Claude Code. **Three** workstreams share one repo and one spine.

- **B. `selflearn-core`** — reusable self-learning library. Logs predictions, resolves outcomes, scores, feeds back. The spine both other workstreams plug into.
- **A. `power2026-backtest`** — research harness that tests the checkable claims in the Power 2026 primer (electricity-market mechanics).
- **C. `liddar-execution`** — web-based trading application that connects to Schwab and executes proven signals, with tax-loss harvesting as a first-class feature.

> **Naming.** "Power 2026" refers to the **electricity-market thesis and its research** (Workstream A). The **trading application is `liddar-execution`** (Workstream C), so the word "Power 2026" never means "the trading app." The umbrella product can still be marketed as "Power 2026" externally; inside the repo the names are distinct.

Status of this file: living document. Jimmy updates it with keys, data access, priority calls. Sections marked `TODO(jimmy)` wait on him. Anything date/API/endpoint-sensitive is marked `VERIFY` — confirm against current provider docs before wiring.

---

## 0. How to use this file

- Treat this as the project spec. Read it fully before writing code.
- Operating discipline: follow `fable-mode` (plan, define "done", verify before claiming done, label verified vs inferred vs guessed, no invented paths/APIs/numbers). Installed as a skill.
- Confirm every `VERIFY` against the provider's current docs before wiring. Do not trust remembered endpoint URLs or parameter names.
- Deliver planning as markdown in the working dir; summarize in chat with file paths.

---

## 1. Mission

Three goals, one shared spine.

1. **Prove or disprove the primer's market-mechanics claims with data.** (Workstream A.) The Power 2026 primer (https://power2026.ai) makes structural claims about how US power prices form. Most are quantitative and checkable against public data. Build backtests that test them out-of-sample.
2. **Extract the self-learning layer once.** (Workstream B.) The Liddar scanner currently predicts and forgets. Build a standalone `selflearn-core` that logs predictions, joins them to realized outcomes, scores them, and feeds the result back. Every other flow consumes it.
3. **Execute proven signals, safely, on real money.** (Workstream C.) A web-based application that connects to a Schwab brokerage account and places orders for signals that `selflearn-core` has shown to carry a calibrated, net-of-cost-and-tax edge. Tax-loss harvesting is a core business driver, not an afterthought.

"Self-learning" means a walk-forward feedback loop, not a black box. Fit on a training window, predict forward, wait for the outcome, score, then retrain including the new realized data. No lookahead. See Section 6.

### Decisions locked in (Jimmy's calls A–D)

- **A.** "Power 2026" = the research/thesis; the trading app is `liddar-execution`. *(pending confirmation; proceeding on this reading)*
- **B.** v1 execution target = **Liddar equity-options ideas** (most direct path from what exists). The energy thesis stays research until it produces its own tradable signals. *(pending confirmation)*
- **C.** v1 execution mode = **simulate fills locally → human-approves-every-order → auto-with-limits only after a long verified track record.** Never start fully automated. *(pending confirmation)*
- **D.** Build order = **`selflearn-core` first (Gate 1)**, then H1 backtest, then scanner integration, then Schwab execution. *(pending confirmation)*

`TODO(jimmy)`: confirm or redirect A–D.

---

## 2. Source material: the checkable claims

From the primer. Standard/stable mechanics (safe to encode) versus primer-specific figures (hypotheses to verify).

**Stable mechanics (encode as model logic):**
- Marginal / uniform-clearing-price pricing: clearing LMP equals the marginal cost of the last unit dispatched. Usually a gas unit sets it.
- Spark spread: `Power Price - (Heat Rate * Natural Gas Price)`. Dark spread is the coal analogue.
- Effective heat rate of a region: `Power Price / Gas Price` (implied heat rate of a gas unit earning exactly $0).
- Merit order: rank generators by marginal cost (roughly heat rate x fuel price); the last one needed sets price.
- Duck curve: net load (demand minus renewables) dips midday, spikes evening as solar grows, widening the intraday spread.
- Market design: energy-only (ERCOT, Alberta) vs capacity markets (PJM, CAISO). "Missing money" and scarcity adders.

**Primer-specific figures (claims, do NOT hardcode as truth):**
- Data centers ~5% of US consumption, doubling roughly every two years.
- ERCOT West/North wind zones going negative (to about -$20/MWh) under high wind.
- Homer City redevelopment scale, TeraWulf/Anthropic and SpaceX/Reflection implied $/MWh, EIA report dates. Context, not test targets; several post-date model training. `VERIFY` if cited.

---

## 3. Workstream A: Power 2026 backtests

Each hypothesis has an acceptance check. "Done" = the check runs on real data and produces a pass/fail with the stated evidence, not merely that the code executes.

### H1. Gas sets the price (marginal pricing + spark spread)
Claim: in a gas-marginal ISO, LMP tracks `implied_heat_rate * Henry_Hub`.
Method: regress day-ahead LMP on gas price over gas-marginal hours; recover implied heat rate (slope).
Acceptance: report slope and R^2 by ISO/zone; slope in a plausible band (~6 to 12) for the majority of gas-marginal hours. Fails if the relationship is absent where the primer says it holds.

### H2. Duck curve widening
Claim: intraday spread (evening peak minus midday trough) has widened as renewables grew.
Method: in CAISO (ERCOT for contrast), compute daily `evening_price - midday_price`; regress on time and on solar/wind share.
Acceptance: positive, statistically significant trend. Report slope per year and change in average spread across the sample.

### H3. Negative pricing in ERCOT wind zones
Claim: West/North ERCOT LMPs go negative a nontrivial fraction of high-wind, low-load hours.
Method: frequency of negative LMP conditioned on wind output deciles.
Acceptance: negative-price frequency materially higher in top wind deciles than bottom. Report conditional frequencies.

### H4. Merit-order dispatch predicts the marginal fuel
Claim: a stack from EIA-860 heat rates + fuel prices predicts which fuel is on the margin.
Method: build the merit order, predict marginal fuel per hour, compare to a realized-marginal-fuel proxy.
Acceptance: agreement beats a naive always-gas baseline by a meaningful margin. Report the confusion matrix.

Self-learning hook: run each hypothesis walk-forward. Fit the parameter on a rolling training window, predict the next window, log via `selflearn-core`, resolve when realized prices arrive, score.

### Data sources (`VERIFY` at wire-up)
- **EIA API v2** `VERIFY`: fuel prices (Henry Hub), some wholesale electricity, generation by fuel. Free key. `TODO(jimmy): EIA API key`.
- **EIA-860** (annual bulk) `VERIFY`: generator nameplate capacity, prime mover, fuel, heat-rate inputs. No key.
- **ISO LMPs** `VERIFY`: cleanest path is the `gridstatus` Python library (CAISO, ERCOT, MISO, PJM, ISONE, NYISO, SPP), free tier + paid hosted API. Direct portals (CAISO OASIS, ERCOT MIS, PJM Data Miner) free but quirky. `TODO(jimmy): gridstatus.io key? priority ISOs?`
- **Renewables / load** `VERIFY`: ISO fuel-mix and load feeds, or EIA hourly grid monitor.

Priority: `TODO(jimmy)` default rec = **H1 in one ISO (ERCOT or CAISO)** — easiest data pair, validates the core pricing claim before the heavier merit-order reconstruction.

---

## 4. Workstream B: `selflearn-core`

The reusable spine. Language: Python. The React terminal reads results over a small JSON/DB boundary (Section 5).

In order:
1. **Prediction store** (append-only log): `id, ts, model_version, task, features, prediction, confidence, horizon, meta`.
2. **Outcome resolver**: when a prediction's horizon elapses, fetch/join the realized outcome and attach it.
3. **Scorer**: per-task metrics on resolved predictions. Scanner: hit rate, realized PnL per idea, Brier score on confidence, calibration curve. Power backtest: MAE/MAPE on price, sign accuracy, R^2. Rolling and by cohort.
4. **Registry**: versioned model configs with live scores; promote or roll back.
5. **Updater (feedback policy)** with staged autonomy:
   - L0 monitor only. Log and score, change nothing. Start here.
   - L1 calibration layer (Platt/isotonic on confidence).
   - L2 weight/ensemble adjustment across configs by live score.
   - L3 prompt/param optimization (scanner: tune prompt/universe from what worked).
   - L4 trained meta-model over logged features and outcomes.
   Default L1. Promotion between levels is a manual gate.

**Adapters** (each project implements `predict()` and `resolve_outcome()`):
- `ScannerAdapter`: wraps the Liddar AI Calls/Puts output. Logs each idea (ticker, direction, strike, expiry, confidence); resolves against realized move over the horizon.
- `PowerBacktestAdapter`: logs each hypothesis's forward prediction; resolves against realized LMP.

**Feature layer** (`selflearn_core.features`): the wide signal universe — candles/volume/trend (`price_action`), plus macro (`macro_policy`), wars/regional conflict (`geopolitics`), finite goods/precious metals (`commodities`), and AI/data-center/power/water/chips (`ai_infra`) — becomes point-in-time, no-lookahead features. Alignment is **measured** per cohort on resolved outcomes, never hardcoded. Taxonomy + no-lookahead validator + assembler are real at Gate 1; concrete data packs unlock at Gates 2+. See `docs/feature-alignment.md`.

**Storage**: start SQLite behind a storage interface (Parquet for backtest series). Supabase connector available if hosted later. Keep swappable; do not couple scoring to the store.

---

## 5. Workstream C: `liddar-execution` (web-based trading app)

New in this revision. Connects to a Schwab brokerage account and executes signals that `selflearn-core` has scored as edge-positive net of cost and tax. Web-based front end (extends the existing Liddar Terminal).

### Business drivers (in priority order)
1. **Accuracy** — never place an order the system did not intend; reconcile positions against the broker every cycle.
2. **Profitability** — the objective is expected value **net of commissions, slippage, and tax**, not gross hit rate.
3. **Tax-loss harvesting (TLH)** — lot-level accounting, wash-sale-safe harvesting, short vs long-term awareness. First-class module, see `docs/tech-design.md`.
4. **Latency / responsiveness** — low-latency, event-driven reaction to signals and quotes. See the reality check below.
5. **Speed of iteration** — sim and live share one execution code path so backtests predict live behavior.

### Reality check on "high frequency" (`VERIFY`)
The Schwab Trader API is a **retail REST + streaming (WebSocket) API with OAuth and rate limits** — not a colocated, direct-market-access, FIX venue. **True HFT (microsecond, colocation) is not achievable on a retail Schwab account, and the Liddar options ideas are daily/intraday swing signals anyway, not high-frequency.** The achievable and correct target is a **low-latency, event-driven system**: sub-second reaction to streamed quotes and signals, async non-blocking order placement, idempotent order management. We design for that, and we do not claim HFT. `VERIFY` Schwab's current API surface, rate limits, and streaming coverage before wiring. Schwab consolidated the former TD Ameritrade API onto the **Schwab Trader API**; there is **no official paper-trading sandbox** — "paper first" means simulating fills locally against live quotes.

### v1 scope
- Read-only first: connect Schwab (OAuth), pull positions/balances/orders, reconcile. No orders placed.
- Then simulated execution: route scanner signals through the OMS in sim mode (local fills vs live quotes).
- Then human-approved live orders behind the full risk gate (Section 6) and TLH guard.
- Fully-automated only after a long verified track record and an explicit gate.

`TODO(jimmy)`: Schwab developer account + app registration (OAuth client id/secret, redirect URI). Options approval level on the account. Margin vs cash (pattern-day-trader implications).

---

## 6. Guardrails

### Learning loop (all workstreams)
- **No lookahead.** Features may use only data available at prediction time. Only the resolver sees the future, and only after the horizon.
- **Walk-forward only.** No fitting on data overlapping the test window. Every reported score is out-of-sample.
- **Minimum sample before acting.** Updater stays at L0 for a task until enough resolved predictions exist. `TODO(jimmy)`: threshold, default **30** resolved outcomes per task/cohort.
- **Regime awareness.** Score by cohort (ISO, regime, volatility bucket). Do not average across regimes.
- **Small-sample honesty.** Report confidence intervals, not point hit-rates, until the sample is real.
- **Promotion is gated.** Config promotion and autonomy-level increases are manual. The loop proposes; Jimmy approves.

### Execution (Workstream C) — hard pre-trade gate
Every order passes all checks or is rejected. No exceptions, no bypass path.
- Position-size cap per symbol and aggregate gross/net exposure cap.
- Daily realized-loss cap → kill switch for the session when hit.
- Buying-power / margin check against live balances.
- **Wash-sale guard**: reject any order that would trigger a wash sale negating a harvested loss (30-day window, substantially-identical test incl. options).
- Symbol allowlist; no orders outside it.
- Idempotency: every order carries a client key; retries never double-send.
- Reconciliation loop: broker state is truth; divergence halts trading and alerts.
- Global kill switch reachable from the terminal.

### Legal / compliance
- Research and informational only, not financial advice. Consistent with Liddar project rules.
- Pattern-day-trader rule (PDT, $25k min equity for >3 day trades / 5 business days in a margin account) `VERIFY`. Options approval levels gate strategy types `VERIFY`.

---

## 7. Backlog (gated)

Stop and confirm at each gate.

- **Gate 1: architecture.** This file + `selflearn-core` interface signatures + storage schema + solution architecture + tech design. No modeling, no live orders. **← current**
- **Gate 2: data + first signal.** EIA gas + one ISO's DA LMP flowing; H1 running walk-forward in one ISO; predictions logging to `selflearn-core` at L0.
- **Gate 3: full backtest set + scoring.** H2–H4 with acceptance checks; scorer + calibration (L1) live; results write-up per hypothesis.
- **Gate 4: scanner integration.** `ScannerAdapter` piping real Liddar picks into the core; terminal reads live hit-rates.
- **Gate 5: execution — read-only.** Schwab OAuth + positions/balances/orders read + reconciliation. No orders.
- **Gate 6: execution — simulated.** Signals routed through the OMS in sim mode; TLH engine proposing harvests; full risk gate enforced against sim.
- **Gate 7: execution — human-approved live.** Real orders, one-by-one human approval, hard limits, kill switch. Fully-auto is a separate later gate.

---

## 8. Calibration: verified vs assumed

- **Verified (past work):** Liddar Terminal exists, deployed at liddar-terminal.vercel.app, AI Calls/AI Puts tabs using Claude Haiku via a Vercel serverless proxy, single-shot prompts, no outcome logging. That gap is what Workstream B closes.
- **Verified (domain formulas):** spark spread, dark spread, effective heat rate, merit-order and marginal-pricing definitions in Section 2.
- **Inferred (design choices, open to redirect):** repo layout, Python for the core, SQLite default, four autonomy levels, H1-first, `liddar-execution` naming, event-driven execution architecture, TLH as a core driver.
- **Unverified (`VERIFY` before use):** every external endpoint and free-tier limit; Schwab API surface/rate-limits/streaming/no-sandbox; PDT and options-approval rules; any primer figure with a post-2025 date.
- **Unknown (`TODO(jimmy)`):** other AI projects, data keys/subscriptions, priority hypothesis, sample thresholds, Schwab app credentials, account type.

---

## 9. TODO(jimmy)

- [ ] Confirm or redirect decisions A–D (Section 1).
- [ ] Other AI projects to fold into `selflearn-core` (repos/links).
- [ ] Data access: EIA API key? gridstatus.io free tier or paid? ISO subscription?
- [ ] Priority hypothesis + ISO (default rec: H1 in ERCOT or CAISO).
- [ ] Minimum resolved-sample threshold before L0→L1 (default rec: 30).
- [ ] Hosting for the core: local SQLite, or Supabase?
- [ ] Schwab: developer account, app registration (OAuth), account type (cash/margin), options approval level.
- [ ] Tax context for TLH: account is taxable? cost-basis method (spec-ID lots recommended)? state?
- [ ] Confirm guardrail: research/informational only, not financial advice.
