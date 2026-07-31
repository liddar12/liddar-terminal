-- selflearn-core storage schema (Gate 1).
-- Append-only prediction log + resolved outcomes + model registry.

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
