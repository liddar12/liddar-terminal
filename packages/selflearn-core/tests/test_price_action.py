"""Gate 2 tests for the wired PriceActionPack: the technicals are correct, the
pack is strictly point-in-time (no future candle leaks in), and it degrades
gracefully with thin history.
"""

import math

import pytest

from selflearn_core.features import (
    Bar,
    InMemoryBarSource,
    PriceActionPack,
    assemble_features,
    compute_price_action_features,
    validate_no_lookahead,
)


def _bars(closes, start_ts=60, step=60, vol=1000.0):
    """Build bars from a close series. ts = bar close time = start + i*step."""
    out = []
    prev = closes[0]
    for i, c in enumerate(closes):
        out.append(
            Bar(
                ts=start_ts + i * step,
                open=prev,
                high=max(prev, c) * 1.001,
                low=min(prev, c) * 0.999,
                close=c,
                volume=vol,
            )
        )
        prev = c
    return out


def test_basic_returns_and_trend_on_a_rising_series():
    closes = [float(100 + i) for i in range(25)]  # steady uptrend
    f = compute_price_action_features(_bars(closes))
    assert f["close"] == closes[-1]
    assert f["ret_1"] > 0
    assert f["ret_5"] > 0
    assert f["trend_20"] > 0          # price above its 20-bar mean
    assert f["sma_cross"] > 0          # fast SMA above slow SMA
    assert f["rsi_14"] == 100.0        # monotonic rise → no losses
    assert 0 < f["sma_10"] < f["close"]


def test_downtrend_flips_the_signs():
    closes = [float(140 - i) for i in range(25)]
    f = compute_price_action_features(_bars(closes))
    assert f["ret_1"] < 0
    assert f["trend_20"] < 0
    assert f["sma_cross"] < 0
    assert f["rsi_14"] == 0.0          # monotonic fall → no gains


def test_realized_vol_near_zero_on_constant_step():
    # constant absolute step → nearly constant returns → tiny dispersion
    closes = [float(100 + 2 * i) for i in range(30)]
    f = compute_price_action_features(_bars(closes))
    assert f["realized_vol_20"] >= 0
    assert f["realized_vol_20"] < 0.01


def test_vol_ratio_reflects_a_volume_spike():
    closes = [100.0] * 25
    bars = _bars(closes, vol=1000.0)
    spiked = bars[:-1] + [Bar(**{**bars[-1].__dict__, "volume": 5000.0})]
    f = compute_price_action_features(spiked)
    assert f["vol_ratio_20"] == pytest.approx(5000.0 / ((1000.0 * 19 + 5000.0) / 20))
    assert f["vol_ratio_20"] > 1.0


def test_thin_history_returns_only_supported_features():
    f = compute_price_action_features(_bars([100.0, 101.0]))
    assert f["close"] == 101.0
    assert "ret_1" in f
    assert "sma_20" not in f          # not enough history — omitted, not faked
    assert "rsi_14" not in f


def test_empty_history_is_empty_not_an_error():
    assert compute_price_action_features([]) == {}


def test_snapshot_is_point_in_time_and_excludes_future_bars():
    closes = [float(100 + i) for i in range(30)]
    bars = _bars(closes)  # ts = 60, 120, ... 1800
    # a future candle the pack must NOT see when as_of falls before it
    future = Bar(ts=100_000, open=999, high=1000, low=998, close=999, volume=1)
    src = InMemoryBarSource({"AAPL": bars + [future]})

    as_of = bars[-1].ts  # 1800, before the future bar
    snap = PriceActionPack(src).snapshot("AAPL", as_of)

    assert snap.values["close"] == closes[-1]     # last real bar, not 999
    assert max(snap.obs_ts.values()) <= as_of     # every observation in the past
    validate_no_lookahead(snap)                    # structural guard passes


def test_snapshot_at_earlier_time_uses_only_bars_up_to_then():
    closes = [float(100 + i) for i in range(30)]
    bars = _bars(closes)
    src = InMemoryBarSource({"AAPL": bars})

    mid = bars[9].ts  # only the first 10 bars are known here
    snap = PriceActionPack(src).snapshot("AAPL", mid)
    assert snap.values["close"] == closes[9]
    assert "sma_20" not in snap.values  # 20-bar features not yet computable


def test_snapshot_assembles_into_namespaced_prediction_features():
    closes = [float(100 + i) for i in range(25)]
    src = InMemoryBarSource({"AAPL": _bars(closes)})
    as_of = 60 + 24 * 60
    snap = PriceActionPack(src).snapshot("AAPL", as_of)
    feats = assemble_features([snap], as_of_ts=as_of)
    assert "price_action.price_action.close" in feats
    assert "price_action.price_action.rsi_14" in feats
    assert all(not math.isnan(v) for v in feats.values())
