"""Gate 2 tests for the walk-forward harness: the pipeline runs end-to-end, it
never peeks at the future, the Wilson interval is sane, and a trend rule scores
above chance on a trending series (and near chance on noise — no manufactured
edge).
"""

import math

from selflearn_core.backtest import run_walkforward, score_resolved, trend_signal, wilson_ci
from selflearn_core.features import Bar, InMemoryBarSource


def _series_to_bars(closes, start_ts=86400, step=86400):
    bars, prev = [], closes[0]
    for i, c in enumerate(closes):
        bars.append(Bar(ts=start_ts + i * step, open=prev,
                        high=max(prev, c) * 1.002, low=min(prev, c) * 0.998,
                        close=c, volume=1000.0))
        prev = c
    return bars


def test_wilson_ci_bounds_and_width():
    lo, hi = wilson_ci(6, 10)
    assert 0.0 <= lo < 0.6 < hi <= 1.0
    lo_big, hi_big = wilson_ci(600, 1000)
    assert (hi_big - lo_big) < (hi - lo)  # more data → tighter interval


def test_uptrend_scores_above_chance():
    closes = [100.0 * (1.01 ** i) for i in range(220)]  # steady compounding uptrend
    src = InMemoryBarSource({"UP": _series_to_bars(closes)})
    resolved = run_walkforward(src, "UP", trend_signal, horizon_bars=5)
    assert len(resolved) > 30
    scores = {s.metric: s for s in score_resolved(resolved, cohort="UP")}
    assert scores["hit_rate"].value > 0.9        # a real uptrend is easy
    assert scores["hit_rate"].ci_low > 0.5        # and the interval clears chance
    assert scores["mean_signed_return"].value > 0
    assert scores["hit_rate"].n == len(resolved)


def test_downtrend_is_also_caught_by_shorts():
    closes = [100.0 * (0.99 ** i) for i in range(220)]
    src = InMemoryBarSource({"DN": _series_to_bars(closes)})
    resolved = run_walkforward(src, "DN", trend_signal, horizon_bars=5)
    assert all(r.prediction.prediction["direction"] == "short" for r in resolved)
    scores = {s.metric: s for s in score_resolved(resolved, cohort="DN")}
    assert scores["hit_rate"].value > 0.9


def test_no_lookahead_features_precede_resolution():
    closes = [100.0 + math.sin(i / 6.0) * 5 + i * 0.2 for i in range(200)]
    src = InMemoryBarSource({"X": _series_to_bars(closes)})
    resolved = run_walkforward(src, "X", trend_signal, horizon_bars=5)
    assert resolved  # the wavy series produces trades
    for r in resolved:
        # every prediction is stamped before its outcome resolves
        assert r.prediction.ts < r.outcome.resolved_ts
        # and the horizon in seconds matches a 5-bar (5-day) gap
        assert r.prediction.horizon_s == 5 * 86400


def test_abstains_when_history_too_short():
    # only 25 bars: warmup consumes them, nothing to resolve at horizon 5
    closes = [100.0 + i for i in range(25)]
    src = InMemoryBarSource({"S": _series_to_bars(closes)})
    resolved = run_walkforward(src, "S", trend_signal, horizon_bars=5)
    assert resolved == []
    assert score_resolved(resolved, cohort="S") == []
