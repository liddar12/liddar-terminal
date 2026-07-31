# Technical Design

Concrete tech choices, data contracts, and module design. Companion to `solution-architecture.md` (which covers system shape and drivers). Status labels: **[verified]**, **[inferred]**, **[VERIFY]**.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Core + ML + backtests | **Python 3.11+** | Data-science stack; matches the brief. [inferred] |
| Package/deps | **`uv` or `pip` + `pyproject.toml`** | Standard, reproducible. [inferred] |
| Read-only Results API | **FastAPI** | Async, typed, small. Serves scores/hit-rates as JSON + SSE. [inferred] |
| Execution API + engine | **FastAPI control plane + long-running async worker** | Holds the Schwab WebSocket and hot state; serverless cannot. [inferred] |
| Durable store | **SQLite → Postgres/Supabase** behind an interface | Zero-config solo start; swap to hosted without touching scoring. [inferred] |
| Time series | **Parquet** (backtests), **Timescale/Postgres** if hosted | Columnar for series; transactional for ledgers. [inferred] |
| Hot state / pub-sub | **Redis** (when the engine goes always-on) | Sub-ms shared state and event fan-out. [inferred, add at Gate 6] |
| Web terminal | **Next.js / React on Vercel** | Existing Liddar Terminal stack. [verified] |
| Broker | **Schwab Trader API** (OAuth, REST, WebSocket) | Jimmy's account. [VERIFY surface + limits] |
| Market data (equities/options) | Schwab quotes + [VERIFY] a backup quote source | Live quotes for sim fills and signal context. |
| Market data (power) | EIA API v2, EIA-860, `gridstatus` | Workstream A. [VERIFY endpoints/limits] |

Latency budget target (event-driven, not HFT) [inferred, to measure at Gate 6]:
`quote/signal received → intent → risk gate → order sent` under ~250 ms in-process, network to Schwab on top. Measured, not assumed.

---

## 2. `selflearn-core` interfaces (Gate 1 deliverable)

Signatures only at Gate 1; bodies raise `NotImplementedError` until their gate. Full types live in the package; summarized here.

### Core records (`selflearn_core/types.py`)
- `Prediction(id, ts, model_version, task, features: dict, prediction, confidence: float|None, horizon_s: int, meta: dict)`
- `Outcome(prediction_id, resolved_ts, realized, meta: dict)`
- `ResolvedPrediction(prediction, outcome)` — the join the scorer consumes.
- `Score(task, cohort, metric, value, n, ci_low, ci_high, window)` — every score carries its sample size and interval (small-sample honesty).

### Storage interface (`store/base.py`)
```
class StorageBackend(ABC):
    def append_prediction(self, p: Prediction) -> str          # returns id
    def attach_outcome(self, o: Outcome) -> None
    def unresolved(self, task, now_ts) -> Iterator[Prediction]  # horizon elapsed, no outcome
    def resolved(self, task, since=None, cohort=None) -> Iterator[ResolvedPrediction]
    def get_prediction(self, id) -> Prediction | None
```
`SqliteStore` implements it. Schema in Section 3. Parquet backend can implement the same interface for backtest series.

### Scoring (`scoring/`)
- `metrics.py`: `score_task(resolved, task_spec) -> list[Score]`. Regression (MAE, MAPE, R², sign accuracy) and classification/idea (hit rate, realized PnL, Brier). Always by cohort and rolling window, always with `n` and CI.
- `calibration.py`: `fit_calibrator(resolved) -> Calibrator` (Platt/isotonic); `Calibrator.apply(confidence) -> calibrated`. This is the L1 updater's mechanism.

### Registry (`registry/registry.py`)
- `register(config) -> version`; `get(version)`; `live_scores(task)`; `promote(version)`; `rollback(task)`. Versioned configs + their live scores; promotion is a manual gate.

### Updater (`updater/policy.py`)
- `class UpdatePolicy(ABC): def propose(self, scores) -> list[Change]`.
- `Level0Monitor` (no-op), `Level1Calibration`, `Level2Ensemble`, `Level3ParamOpt`, `Level4MetaModel`. Default L1. Every proposal requires manual apply; `min_resolved` gate (default 30) keeps a task at L0 until it has enough resolved outcomes.

### Adapters (`adapters/`)
```
class Adapter(ABC):
    def predict(self, context) -> Prediction        # log-ready prediction
    def resolve_outcome(self, prediction) -> Outcome | None   # None if horizon not elapsed
```
- `ScannerAdapter`: wraps Liddar AI Calls/Puts; idea → prediction; resolves against realized move over the idea's horizon.
- `PowerBacktestAdapter`: hypothesis forward prediction; resolves against realized LMP.

---

## 3. Storage schema (Gate 1 deliverable)

SQLite DDL, the append-only spine. Ships as `store/schema.sql` and is applied by `SqliteStore.init_schema()`.

```sql
CREATE TABLE IF NOT EXISTS predictions (
    id            TEXT PRIMARY KEY,        -- uuid
    ts            INTEGER NOT NULL,        -- unix seconds, prediction time
    model_version TEXT NOT NULL,
    task          TEXT NOT NULL,           -- 'scanner' | 'power_h1' | ...
    features      TEXT NOT NULL,           -- JSON, only data known at ts (no lookahead)
    prediction    TEXT NOT NULL,           -- JSON (direction/price/etc.)
    confidence    REAL,                    -- nullable
    horizon_s     INTEGER NOT NULL,        -- seconds until resolvable
    cohort        TEXT,                    -- ticker / ISO / regime bucket
    meta          TEXT                     -- JSON
);
CREATE INDEX IF NOT EXISTS idx_pred_task_ts ON predictions(task, ts);

CREATE TABLE IF NOT EXISTS outcomes (
    prediction_id TEXT PRIMARY KEY REFERENCES predictions(id),
    resolved_ts   INTEGER NOT NULL,
    realized      TEXT NOT NULL,           -- JSON (realized value/PnL)
    meta          TEXT
);

CREATE TABLE IF NOT EXISTS registry (
    version       TEXT PRIMARY KEY,
    task          TEXT NOT NULL,
    config        TEXT NOT NULL,           -- JSON
    created_ts    INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'candidate',  -- candidate|live|retired
    autonomy      INTEGER NOT NULL DEFAULT 0          -- L0..L4
);
```

Invariant: `predictions.features` may reference only data with timestamp ≤ `ts`. Enforced by construction in adapters and asserted in tests. [inferred]

---

## 4. Execution engine design (Workstream C, Gates 5–7)

Not built at Gate 1; specified here so the interfaces are stable.

### Broker abstraction (sim and live share it)
```
class Broker(ABC):
    def get_positions(self) -> list[Position]
    def get_balances(self) -> Balances
    def place_order(self, order: OrderIntent, client_key: str) -> OrderAck   # idempotent on client_key
    def cancel(self, broker_order_id) -> None
    def stream_quotes(self, symbols) -> Iterator[Quote]
    def stream_fills(self) -> Iterator[Fill]
```
- `SimBroker`: fills `OrderIntent`s against live streamed quotes with a slippage/latency model. Used for backtests and sim gate. [inferred]
- `SchwabBroker`: OAuth + REST + WebSocket. [VERIFY every endpoint, order schema, and rate limit before wiring.]

### OMS
- Client-order key per intent; dedup table so retries never double-send. State machine `NEW → SENT → (PARTIAL) → FILLED | REJECTED | CANCELLED`. Reconciler reads broker orders/positions each cycle; broker wins; divergence halts + alerts.

### Risk gate (pure function, fully unit-testable)
```
def check(intent: OrderIntent, state: AccountState, limits: Limits, ledger: LotLedger) -> GateResult
```
Runs: size cap, exposure cap, daily-loss cap, buying-power, **wash-sale guard**, allowlist, idempotency-key presence. Returns pass or a specific rejection reason. No I/O inside; deterministic and testable.

### TLH engine + lot ledger
- `LotLedger`: open lots per symbol (acquire ts, basis, qty), specific-ID selection.
- `find_harvests(ledger, realized_gains, params) -> list[HarvestProposal]`: losses past threshold that offset gains, short/long-term aware.
- `wash_sale_risk(symbol, side, ledger, window=30d) -> bool`: checks substantially-identical purchases in the ±30-day window, including options on the same underlying. Used by both the harvest finder and the risk gate. [VERIFY exact options treatment]

---

## 5. Data contracts (terminal ↔ core)

Small, documented, JSON. The terminal never imports Python. [inferred]

- `GET /scores?task=&cohort=&window=` → `[{task, cohort, metric, value, n, ci_low, ci_high, window, model_version}]`
- `GET /configs?task=` → registry entries with live scores + status + autonomy.
- `GET /predictions?task=&resolved=` → recent predictions/outcomes for display.
- Execution control plane (authenticated, audited, separate): `GET /positions`, `GET /orders`, `POST /orders/approve`, `POST /kill`. No order leaves without passing the gate server-side; the terminal only approves, it does not construct raw orders.

---

## 6. Testing strategy

- **No-lookahead assertion**: a test that fails if any prediction's `features` reference a timestamp after its `ts`.
- **Risk gate**: table-driven unit tests — one row per rejection reason, including wash-sale cases.
- **Sim/live parity**: the same `OrderIntent` through `SimBroker` and (later, in a Schwab test account) `SchwabBroker` produces the same OMS state transitions.
- **Walk-forward harness**: asserts no training window overlaps a test window.
- **Scoring**: known inputs → known metrics; CI shrinks as `n` grows.

---

## 7. Sequencing

Matches the gates in `power2026-build.md`:
1. **Gate 1 (now):** these docs + `selflearn-core` interfaces + schema. No modeling, no orders.
2. **Gate 2–4:** implement store/scoring/updater bodies; H1 backtest; scanner adapter; terminal reads scores.
3. **Gate 5–7:** `Broker`/OMS/risk gate/TLH; Schwab read-only → sim → human-approved live.

Every body currently raises `NotImplementedError` with the gate that unlocks it named in the docstring, so nothing is a silent stub.
