# Macro feature spec: the four macro families

Spec for the feature packs that carry the wider world into the spine —
`macro_policy`, `geopolitics`, `commodities`, `ai_infra`. Companion to
`feature-alignment.md` (the why) and `price_action.py` (the family already
wired). Same contract as every pack: `snapshot(symbol, as_of_ts) ->
FeatureSnapshot`, every value stamped with an `obs_ts <= as_of_ts`.

Status labels: **[verified]**, **[inferred]**, **[VERIFY]** (confirm the source
against current provider docs before wiring — no remembered endpoints).

---

## 0. The rule that makes macro honest: vintages, not final values

Price data has one timestamp. **Macro data has two** — the *reference period*
(the month the CPI describes) and the *release datetime* (when the number was
published, weeks later, and often revised again after that). Using the final,
revised value at a historical date is lookahead — the market never saw it then.

So every macro pack obeys two extra rules on top of the shared no-lookahead
validator:

1. **`obs_ts` = release datetime, never the reference period.** A June CPI
   released July 15 has `obs_ts = 2025-07-15T12:30Z`, not June 30.
2. **Point-in-time vintages.** When a series is revised, use the value *as it
   stood at `as_of_ts`* — the first print for a historical date, not today's
   revised number. FRED's ALFRED archive provides this for its series; other
   sources need their own vintage handling or a first-print snapshot at ingest.

Consensus/expectations (for surprise features) must likewise be the pre-release
consensus, captured before the print. Get this wrong and every backtest score is
inflated. This is the single most important thing in this document.

---

## 1. `macro_policy` — rates, policy, prints

| | |
|---|---|
| **Features** | policy rate (fed funds target, EFFR); rate expectations (fed-funds-futures / SOFR-implied path); yield-curve slope (2s10s, 3m10y); real yield (10y TIPS); CPI / PCE / NFP / unemployment as **surprise = actual − consensus**, standardized; USD index (DXY); financial-conditions index; event flags (FOMC day, CPI day, jobs day) as countdowns/booleans; regulatory & tariff event flags; election calendar |
| **Encoding** | levels, changes (Δ1d/Δ20d), standardized surprise (z), regime bucket (hiking / hold / cutting; easing / tightening financial conditions) |
| **Sources [VERIFY]** | FRED **+ ALFRED for vintages** (free key); US Treasury par yields; CME fed-funds / SOFR futures for the expected path; BLS/BEA release calendars for exact release datetimes; an economic-calendar provider for consensus (**licensing VERIFY**) |
| **`obs_ts`** | release datetime from the calendar; rates as of prior close |
| **Cadence** | rates/curve daily; prints monthly on fixed release datetimes |
| **Symbol relevance** | mostly symbol-agnostic (the same macro state applies to every name on a date); rate/curve features weigh most on `finance_banking` and `bond_market` |

---

## 2. `geopolitics` — conflict, sanctions, chokepoints

| | |
|---|---|
| **Features** | geopolitical-risk index (GPR, Caldara–Iacoviello); conflict event counts / intensity (GDELT, ACLED); sanctions event flags; shipping-chokepoint stress (Hormuz / Suez / Red Sea flags, tanker rates); market-implied stress confirmers (oil vol, VIX, defense-sector relative strength) |
| **Encoding** | dated risk index level + Δ; event counts over trailing windows; boolean/escalation flags; z-scored intensity |
| **Sources [VERIFY]** | GPR public dataset (daily/monthly); **GDELT** event stream (free, ~15-min latency, carries ingestion timestamps); **ACLED** curated conflict data (**licensed**); news-based indices — articles filtered to `published <= as_of_ts` |
| **`obs_ts`** | the **report/ingest** time, not when the event "happened" (occurrence is often dated later); GDELT gives this directly |
| **Cadence** | GDELT intraday; GPR daily; ACLED weekly |
| **Caveat** | low signal-to-noise for most equities; encode conservatively and let the scorer decide. Expected to matter most for `oil`, `gas_and_fuel`, `commodity_gold`, defense — the scorer confirms or denies per cohort |

---

## 3. `commodities` — metals, energy, balances

| | |
|---|---|
| **Features** | spot & futures-curve levels (gold, silver, copper, WTI, Brent, Henry Hub natgas); **term structure** (contango/backwardation, front–back spread, roll yield); inventory & supply balances (EIA petroleum & natgas storage, COMEX/LME warehouse stocks, Baker Hughes rig count); gold drivers (real rates, DXY); gold/copper ratio (risk proxy) |
| **Encoding** | levels, Δ, spreads, z-scores; storage as surprise vs consensus draw/build |
| **Sources [VERIFY]** | **EIA API v2** (already in the stack for Workstream A — reuse); exchange settlement prices (CME/ICE); LME/COMEX stocks; Baker Hughes rig count; metals spot via the market-data feed |
| **`obs_ts`** | futures settlement time; **EIA storage release datetimes** (petroleum Wed 10:30 ET, natgas Thu 10:30 ET — VERIFY); rig count Fridays |
| **Cadence** | prices daily/intraday; EIA weekly; rig count weekly |
| **Symbol relevance** | **sector-linked** — attach the oil curve to `XOM`/`REI`, the natgas curve to `EQT`/`GPOR`, gold to `GLD`/`SGOL`; do **not** attach the oil curve to a bank. This is where `snapshot(symbol, …)` earns the `symbol` argument |

---

## 4. `ai_infra` — power, chips, water, data centers

| | |
|---|---|
| **Features** | data-center-hub power prices (LMP) & spark spreads (PJM, ERCOT, CAISO); power-demand / data-center-load growth proxies; Henry Hub natgas (the marginal power fuel); semiconductor supply proxies (chip lead times, foundry utilization); water-stress index in data-center regions; memory/HBM price proxies; hyperscaler **capex-guidance** event flags |
| **Encoding** | levels, Δ, spreads, capex/earnings event flags |
| **Sources [VERIFY]** | **EIA + `gridstatus`** for ISO LMPs (reuse Workstream A); semis pricing (**licensed**, VERIFY); hyperscaler capex from earnings, dated to the call |
| **`obs_ts`** | LMP settlement time; capex guidance = earnings-call datetime |
| **Cadence** | LMP hourly/daily; capex quarterly |
| **Dependency** | **downstream of Workstream A.** This family only produces features once the Power 2026 backtests emit point-in-time signals — the most speculative family, gated last. Ties to `NVDA`/`MSFT`/`CRWV` in the universe |

---

## 5. How they plug in (no new machinery)

Each pack is just another `FeaturePack`. The assembly a prediction already uses
doesn't change:

```
snaps = [
    price_action_pack.snapshot(sym, t),   # wired
    macro_policy_pack.snapshot(sym, t),    # this spec
    commodities_pack.snapshot(sym, t),     # this spec (sector-linked)
    # geopolitics_pack, ai_infra_pack ...
]
features = assemble_features(snaps, as_of_ts=t)   # namespaced + re-validated
```

- **Namespacing** keeps families separate (`commodities.commodities.wti_front`,
  `macro_policy.macro_policy.cpi_surprise`) so the scorer can **ablate by
  family** — measure geopolitics' incremental lift by scoring with and without
  it.
- **Cohorts:** score by sector, by **liquidity** (the universe's liquid/thin
  tag), and by **macro regime**. A macro feature that helps in a hiking regime
  and hurts in a cutting one must not be averaged across them.
- **Gate discipline:** every family starts at updater L0 and stays until
  `min_resolved` (30) resolved outcomes exist for that task/cohort. Nothing is
  trusted because it's plausible.

---

## 6. Build order (inferred)

1. **`commodities` + `macro_policy` first** — best data, and `commodities`
   reuses the EIA feed already planned for Workstream A. They also map cleanly
   onto the universe's oil/gas/gold and bank/bond pairs.
2. **`geopolitics`** — GDELT/GPR are reachable; ACLED if licensed. Conservative
   encoding, heavy reliance on the scorer.
3. **`ai_infra` last** — waits on Workstream A producing tradable signals.

Every source above is **[VERIFY]** and several are **licensed** (ACLED, consensus
data, semis pricing). Confirm access and licensing before wiring; where a source
isn't available, the family stays a stub that raises rather than inventing data.
