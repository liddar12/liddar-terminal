# Feature Alignment: how the agent learns from the market and the wider world

Companion to `solution-architecture.md` and `tech-design.md`. This doc answers a
specific question: **how does the self-learning agent take candles, volume, and
trend *and* the macro world — geopolitics, policy, wars and regional conflict,
finite goods, precious metals, AI, data centers, power, water, chips — and learn
what actually aligns with market moves?**

Status labels: **[verified]**, **[inferred]**, **[VERIFY]**.

---

## 1. The core idea: alignment is measured, never assumed

The agent does **not** carry a rule like "war → gold up" or "chip shortage →
semis up." Those are hypotheses, and hypotheses are exactly what the spine is
built to test. The mechanism:

1. At the moment of a prediction, snapshot **everything knowable then** — price
   action *and* the macro world — into `Prediction.features`.
2. Log the prediction with its horizon. Change nothing about the world.
3. When the horizon elapses, resolve the **realized outcome** (the actual move /
   PnL).
4. The scorer measures, **per cohort and rolling window**, whether predictions
   that saw a given feature configuration actually beat a baseline — with the
   sample size `n` and a confidence interval attached to every number.

"Alignment" is therefore an **earned, out-of-sample statistic**, not a wired
belief. A feature family that looks compelling but does not improve resolved
outcomes gets no weight — the calibration/ensemble updater (L1/L2) will not
promote it. This is the whole point of extracting `selflearn-core`: the old
scanner "predicted and forgot"; this measures.

---

## 2. The feature universe → families

Every signal Jimmy named maps to one **family**. A family is a namespace plus a
data-source contract; it is not a claim of edge. Implemented as
`selflearn_core.features.FeatureFamily`.

| Family | Covers (from Jimmy's list) | Point-in-time encoding | Source [VERIFY] |
|---|---|---|---|
| `price_action` | candles (OHLCV), volume, stock trend, momentum, realized vol | bar-derived numbers as of the signal bar **[wired]** | Schwab quotes/bars |
| `macro_policy` | policy, rates, regulation, tariffs, elections | level / change / surprise-vs-consensus, dated to release | macro data providers |
| `geopolitics` | wars, region wars & fighting, sanctions, chokepoint/shipping risk | dated risk indices + event flags | conflict/risk datasets |
| `commodities` | finite goods, precious metals, energy balances | spot/curve levels, spreads, inventory/supply | commodity data + EIA |
| `ai_infra` | AI, data centers, power, water, chips | features from the Power 2026 research once it emits signals | Workstream A (EIA/ISO/gridstatus) |

Each family is produced by a `FeaturePack` with one method:
`snapshot(symbol, as_of_ts) -> FeatureSnapshot`. The pack may only read
observations with `obs_ts <= as_of_ts`.

### The one hard rule: no lookahead
Every feature carries the timestamp of its underlying observation. A geopolitics
headline stamped *after* the prediction moment cannot enter that prediction's
features — `validate_no_lookahead()` raises if it tries, and `assemble_features()`
runs that check before building the `Prediction.features` dict. Without this,
macro features would silently leak the future and every backtest score would be
a lie. This is guardrail §6 ("no lookahead") made structural.

---

## 3. How a single prediction is assembled

```
as_of_ts = signal time
snaps = [pack.snapshot(symbol, as_of_ts) for pack in active_packs]   # each obeys no-lookahead
features = assemble_features(snaps, as_of_ts)   # namespaced {family}.{pack}.{key}, re-validated
Prediction(ts=as_of_ts, features=features, prediction=..., horizon_s=..., cohort=<regime>)
```

Namespacing (`geopolitics.geopolitics.risk_index`, `price_action.price_action.close`)
lets the scorer **ablate by family**: score the model with and without a family
to see whether it adds real, out-of-sample lift. That ablation *is* the answer to
"does geopolitics actually matter for this signal?" — computed, not asserted.

---

## 4. How it backtests (walk-forward, out-of-sample)

The same feature assembly runs over history:

1. **Fit** on a training window (features → outcome relationship for a task).
2. **Predict forward** on the next, untouched window; log via `selflearn-core`.
3. **Resolve** when realized prices arrive; **score** out-of-sample.
4. **Roll** the window forward and repeat. No training window ever overlaps a
   test window (asserted by the walk-forward harness, `tech-design.md` §6).

Scores are always **by cohort** (ticker, regime, volatility bucket) and carry
`n` + CI — a signal that only works in one regime is never averaged into looking
universal. Price-action features backtest first (Gate 2, easiest data); macro
families join as their ingestion lands (Gate 3+), each earning or failing to earn
weight on resolved outcomes.

---

## 5. How it improves (the autonomy ladder, already in the spine)

The updater proposes changes strictly within its autonomy level; promotion is a
manual gate (`updater/policy.py`):

- **L0 monitor** — log and score, change nothing. Every task starts here and
  stays until it has `min_resolved` (default 30) resolved outcomes.
- **L1 calibration** — Platt/isotonic on confidence so a stated 70% means 70%.
- **L2 ensemble** — reweight configs (and, by extension, feature families) by
  live score. A family that stops aligning loses weight here.
- **L3 param/prompt opt** — tune the universe / parameters from what worked.
- **L4 meta-model** — a trained model over the logged features and outcomes.

So "improve it based on what I said" is literal: adding the macro families widens
what L2–L4 can *discover* edge in — but nothing is trusted until resolved
outcomes say so, and no autonomy step happens without Jimmy's promotion.

---

## 6. What is real now vs. what's next

- **Real at Gate 1 [verified]:** the family taxonomy, `FeatureSnapshot`, the
  no-lookahead validator, and `assemble_features` — implemented and tested
  (`tests/test_features.py`). The scorer, calibration, registry, and updater
  interfaces that consume features are already scaffolded.
- **Real at Gate 2 [verified]:** `PriceActionPack` is **wired** — a pure,
  tested computation (`compute_price_action_features`) that turns a bar series
  into 15 point-in-time technicals (returns, SMAs, trend, SMA cross, momentum,
  RSI-14, ATR%, realized vol, relative volume, gap, range). It reads bars
  through a `BarSource` seam: `InMemoryBarSource` for backtests/tests (real),
  `SchwabBarSource` deferred to Gate 5. Strictly point-in-time — a future candle
  cannot enter a snapshot — and it degrades gracefully on thin history rather
  than faking values (`tests/test_price_action.py`, 9 checks).
- **Next [inferred sequencing]:** the macro packs (`macro_policy`,
  `geopolitics`, `commodities`, `ai_infra`) as a **feature-expansion track**
  layered on Gates 3+. Each pack's data source is `VERIFY` before wiring — no
  remembered endpoints.
- **Honest gap:** no macro/geopolitical data is ingested yet. The layer that
  *holds* those features and enforces their correctness now exists; the feeds
  that fill it are named, gated, and unbuilt. Nothing claims edge from a family
  the model has not yet scored.
