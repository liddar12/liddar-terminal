"""Gate 1 smoke tests: the package imports, types construct, and the schema
applies to a fresh SQLite file. No modeling is exercised.
"""

import sqlite3
import tempfile
from pathlib import Path

from selflearn_core import Outcome, Prediction, ResolvedPrediction, Score
from selflearn_core.adapters import PowerBacktestAdapter, ScannerAdapter
from selflearn_core.store import SqliteStore
from selflearn_core.updater import DEFAULT_MIN_RESOLVED, Level0Monitor


def test_types_construct():
    p = Prediction(
        id="p1", ts=1, model_version="v0", task="scanner",
        features={"px": 100}, prediction={"dir": "call"}, horizon_s=3600,
        confidence=0.7, cohort="AAPL",
    )
    o = Outcome(prediction_id="p1", resolved_ts=2, realized={"pnl": 1.0})
    rp = ResolvedPrediction(prediction=p, outcome=o)
    assert rp.prediction.id == rp.outcome.prediction_id
    Score(task="scanner", metric="hit_rate", value=0.6, n=50, window="all")


def test_schema_applies():
    with tempfile.TemporaryDirectory() as d:
        db = str(Path(d) / "s.sqlite")
        SqliteStore(db).init_schema()
        with sqlite3.connect(db) as conn:
            tables = {
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
        assert {"predictions", "outcomes", "registry"} <= tables


def test_level0_is_noop():
    assert Level0Monitor().level == 0
    assert Level0Monitor().propose([]) == []
    assert DEFAULT_MIN_RESOLVED == 30


def test_adapters_have_task_names():
    assert ScannerAdapter.task == "scanner"
    assert PowerBacktestAdapter.task == "power_backtest"
