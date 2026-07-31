"""H1 pipeline tests. Synthetic injected data, temp-file store, no network.

The end-to-end test builds a world where power = 8*gas + 5 exactly, so the
implied heat rate must come back as 8 (inside the acceptance band) with R^2 = 1,
and every fold must log a resolved prediction to the store.
"""

import tempfile
from datetime import date, timedelta
from pathlib import Path

from power2026_backtest.data.eia import parse_eia_series
from power2026_backtest.data.iso import to_daily_mean
from power2026_backtest.hypotheses import align, ols, run_h1
from selflearn_core.store import SqliteStore


# --- pure units ----------------------------------------------------------------

def test_ols_recovers_exact_line():
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [8.0 * x + 5.0 for x in xs]
    slope, intercept, r2 = ols(xs, ys)
    assert abs(slope - 8.0) < 1e-9
    assert abs(intercept - 5.0) < 1e-9
    assert abs(r2 - 1.0) < 1e-9


def test_align_inner_join_on_date():
    gas = [("2024-01-01", 2.0), ("2024-01-02", 2.1), ("2024-01-03", 2.2)]
    power = [("2024-01-02", 21.0), ("2024-01-03", 22.0), ("2024-01-04", 23.0)]
    merged = align(gas, power)
    assert [d for d, _, _ in merged] == ["2024-01-02", "2024-01-03"]


def test_eia_parser_skips_nulls_and_sorts():
    payload = {"response": {"data": [
        {"period": "2024-01-03", "value": 2.2},
        {"period": "2024-01-01", "value": 2.0},
        {"period": "2024-01-02", "value": None},
    ]}}
    assert parse_eia_series(payload) == [("2024-01-01", 2.0), ("2024-01-03", 2.2)]


def test_iso_daily_mean_collapses_hours():
    hourly = [("2024-01-01T00:00", 10.0), ("2024-01-01T01:00", 20.0),
              ("2024-01-02T00:00", 30.0)]
    assert to_daily_mean(hourly) == [("2024-01-01", 15.0), ("2024-01-02", 30.0)]


# --- end-to-end ----------------------------------------------------------------

class _FakeEia:
    def __init__(self, series): self._s = series
    def henry_hub_daily(self, start, end): return self._s


class _FakeIso:
    def __init__(self, series): self._s = series
    def day_ahead_lmp(self, start, end, location=None): return self._s


def _synthetic(n=200, heat_rate=8.0, base=5.0):
    d0 = date(2024, 1, 1)
    gas, power = [], []
    for i in range(n):
        d = (d0 + timedelta(days=i)).isoformat()
        g = 2.0 + 0.01 * i
        gas.append((d, g))
        power.append((d, heat_rate * g + base))
    return gas, power


def test_run_h1_recovers_heat_rate_and_logs():
    gas, power = _synthetic()
    store = SqliteStore(str(Path(tempfile.mkdtemp()) / "s.sqlite"))
    store.init_schema()

    results = run_h1(
        "ERCOT", "2024-01-01", "2024-12-31",
        eia=_FakeEia(gas), iso_client=_FakeIso(power), store=store,
    )

    assert results, "expected walk-forward folds"
    for r in results:
        assert abs(r.slope - 8.0) < 1e-6      # implied heat rate recovered
        assert r.r_squared > 0.999
        assert r.passes()                     # 8 is inside the acceptance band

    # every fold logged a resolved prediction at L0
    resolved = list(store.resolved("power_backtest"))
    assert len(resolved) == len(results)
    for rp in resolved:
        assert rp.outcome.realized["abs_err"] < 1e-6   # exact world -> ~0 error
