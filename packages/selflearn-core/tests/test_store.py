"""SqliteStore CRUD tests. Temp-file DB, no network."""

import tempfile
from pathlib import Path

from selflearn_core.store import SqliteStore
from selflearn_core.types import Outcome, Prediction


def _store():
    d = tempfile.mkdtemp()
    s = SqliteStore(str(Path(d) / "s.sqlite"))
    s.init_schema()
    return s


def _pred(pid="p1", ts=1000, horizon=100, task="scanner", cohort="AAPL"):
    return Prediction(
        id=pid, ts=ts, model_version="v0", task=task,
        features={"x": 1}, prediction={"dir": "call"}, horizon_s=horizon,
        confidence=0.7, cohort=cohort,
    )


def test_append_and_get_roundtrip():
    s = _store()
    s.append_prediction(_pred())
    got = s.get_prediction("p1")
    assert got is not None and got.task == "scanner" and got.features == {"x": 1}
    assert s.get_prediction("missing") is None


def test_unresolved_respects_horizon_and_outcomes():
    s = _store()
    s.append_prediction(_pred("p1", ts=1000, horizon=100))   # resolvable at 1100
    s.append_prediction(_pred("p2", ts=5000, horizon=100))   # resolvable at 5100
    # at now=1200 only p1's horizon elapsed
    assert [p.id for p in s.unresolved("scanner", now_ts=1200)] == ["p1"]
    # attach outcome to p1 -> no longer unresolved
    s.attach_outcome(Outcome(prediction_id="p1", resolved_ts=1200, realized={"pnl": 1.0}))
    assert [p.id for p in s.unresolved("scanner", now_ts=1200)] == []


def test_resolved_join_and_filters():
    s = _store()
    s.append_prediction(_pred("p1", cohort="AAPL"))
    s.append_prediction(_pred("p2", cohort="MSFT"))
    s.attach_outcome(Outcome(prediction_id="p1", resolved_ts=2000, realized={"pnl": 2.0}))
    s.attach_outcome(Outcome(prediction_id="p2", resolved_ts=3000, realized={"pnl": -1.0}))
    allr = list(s.resolved("scanner"))
    assert {r.prediction.id for r in allr} == {"p1", "p2"}
    aapl = list(s.resolved("scanner", cohort="AAPL"))
    assert [r.prediction.id for r in aapl] == ["p1"]
    assert aapl[0].outcome.realized == {"pnl": 2.0}
    since = list(s.resolved("scanner", since=2500))
    assert [r.prediction.id for r in since] == ["p2"]
