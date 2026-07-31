# power2026-backtest (Workstream A)

Research harness that tests the checkable claims in the Power 2026 primer. Not
built at Gate 1 — this directory is the reserved home; see
`docs/power2026-build.md` Section 3 for H1..H4 and their acceptance checks.

Planned layout:

```
power2026-backtest/
  data/        # ingestion: EIA (gas, Henry Hub), ISO LMPs (gridstatus), EIA-860
  models/      # merit order, spark spread, forecasters
  backtests/   # H1..H4 harnesses, each with its acceptance check
  adapter.py   # PowerBacktestAdapter -> selflearn-core
```

First deliverable (Gate 2): H1 (gas sets the price) walk-forward in one ISO
(ERCOT or CAISO), logging predictions to `selflearn-core` at Level 0.

Every external endpoint is `VERIFY` before wiring (EIA API v2, gridstatus
free-tier coverage). Needs `TODO(jimmy)` EIA API key and ISO-priority call.
