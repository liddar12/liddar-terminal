# QA Regression Scripts

Regression suite to run before every merge to `main`. Each case has a stable ID,
the acceptance criterion it guards (`delivery-plan.md`), given/when/then steps,
and whether it's automated today. **Automated cases run from the repo now**;
manual/live cases run at their gate. Run automated suite: `pytest` across
`packages/*/tests` and `apps/*/tests` (28 spine/backtest/signals + 14 execution).

Legend: 🟢 automated & passing · 🟡 automated, pending live data · ⬜ manual/at-gate.

---

## R1 · Self-learning spine

| ID | AC | Given → When → Then | State |
|---|---|---|---|
| R1.1 | 1.1 | Given a prediction · when appended and reloaded · then it round-trips intact | 🟢 `test_store::test_append_and_get_roundtrip` |
| R1.2 | 1.1 | Given a prediction past its horizon with no outcome · when `unresolved(now)` · then it's returned; after `attach_outcome` it isn't | 🟢 `test_store::test_unresolved_respects_horizon_and_outcomes` |
| R1.3 | 1.2 | Given resolved predictions across cohorts · when `resolved(cohort=…, since=…)` · then filters apply and outcomes join | 🟢 `test_store::test_resolved_join_and_filters` |
| R1.4 | 1.2 | Given horizon labels · when ordered · then `1d…max` in order, `max` days = None | 🟢 `test_horizons` |
| R1.5 | 1.3 | Given live confidence 0.60 · when `build_recommendations` · then Medium+High only (Low floor 0.62 not met) | 🟢 `test_recommend::test_confidence_gates_tiers` |
| R1.6 | 1.3 | Given confidence 0.40 · when building · then no tiers offered | 🟢 `test_recommend::test_low_confidence_offers_nothing_risky` |

## R2 · Power backtest (H1)

| ID | AC | Given → When → Then | State |
|---|---|---|---|
| R2.1 | 2.1 | Given power = 8·gas+5 synthetic · when `run_h1` · then slope≈8, R²≈1, PASS, one resolved prediction per fold | 🟢 `test_h1::test_run_h1_recovers_heat_rate_and_logs` |
| R2.2 | 2.1 | Given a constructed lookahead fold · when built · then it's rejected | 🟢 `test_walkforward::test_split_rejects_constructed_lookahead` |
| R2.3 | 2.1 | Given 200 days · when `run_h1_multi` · then fits 5d/1m/6m/max, skips 1y (too large), tags each prediction | 🟢 `test_h1::test_run_h1_multi_across_horizons` |
| R2.4 | 2.1 | Given a valid EIA key + ERCOT egress · when live H1 runs · then real slope/R² produced, no crash | 🟡 pending egress |

## R3 · Execution core

| ID | AC | Given → When → Then | State |
|---|---|---|---|
| R3.1 | 3.3 | Given a quote · when market buy · then it fills and position/cash update | 🟢 `test_execution::test_sim_buy_fills_and_updates_position` |
| R3.2 | 3.2 | Given the same `client_key` twice · when placed via SimBroker · then position changes once | 🟢 `test_execution::test_sim_is_idempotent_on_client_key` |
| R3.3 | 3.3 | Given a limit below the market · when placed · then it does not fill | 🟢 `test_execution::test_sim_unmarketable_limit_does_not_fill` |
| R3.4 | 3.2 | Given each rejection condition (no key, bad qty, not allowlisted, wash-sale, size cap, buying power, loss cap) · when `check` · then rejected with a specific reason; valid order passes | 🟢 `test_execution::test_risk_gate_table` (8 cases) |
| R3.5 | 3.2 | Given held gross at the cap · when a new order adds notional · then gross-exposure rejection | 🟢 `test_execution::test_risk_gate_gross_exposure` |
| R3.6 | 3.2 | Given a retried `client_key` · when via OMS · then broker called exactly once, same order returned | 🟢 `test_execution::test_oms_dedups_and_never_double_sends` |
| R3.7 | 3.1 | Given all adapters · when `capabilities()` · then same interface; Robinhood `official_api=False` | 🟢 `test_execution::test_all_adapters_share_the_port` |

## R4 · Schwab live (at Gate 5–7, manual first run then automated against a test account)

| ID | AC | Given → When → Then | State |
|---|---|---|---|
| R4.1 | 4.1 | Given Schwab OAuth · when connecting · then positions/balances read and reconcile to broker | ⬜ Gate 5 |
| R4.2 | 4.1 | Given internal state diverges from Schwab · when reconcile runs · then trading halts + alert | ⬜ Gate 5 |
| R4.3 | 4.2 | Given a live order · when placed without passing the gate · then it's impossible (no bypass path) | ⬜ Gate 7 |
| R4.4 | 4.2 | Given the kill switch · when triggered · then all trading halts immediately | ⬜ Gate 7 |
| R4.5 | 4.3 | Given an order that would create a wash sale on a harvested loss · when gated · then rejected | ⬜ Gate 6–7 |
| R4.6 | 3.1 | Given `SimBroker` and `SchwabBroker` · when the same intent runs · then identical OMS state transitions (sim/live parity) | ⬜ Gate 6 |

## R5 · Terminal + API

| ID | AC | Given → When → Then | State |
|---|---|---|---|
| R5.1 | 5.1 | Given the score API · when the terminal fetches · then JSON only, no Python import | ⬜ E5 |
| R5.2 | 5.1 | Given the execution control plane · when an order is approved · then it's authenticated + audit-logged | ⬜ E5 |

---

## Regression policy

- Automated cases (🟢) are the merge gate: CI must be green on `main`.
- When a bug is fixed, add a case here that fails before the fix and passes after.
- Live cases (🟡/⬜) get automated against a paper/test account as their gate opens.
- No silent scope cuts: if a run skips coverage (sampling, top-N), it must log it.
