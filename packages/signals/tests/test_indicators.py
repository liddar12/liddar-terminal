"""Clean-room indicator tests. Pure, no network."""

import pytest

from signals.indicators import breakout, rsi, sma


def test_sma_trails_and_warms_up():
    out = sma([1, 2, 3, 4, 5], 3)
    assert out[:2] == [None, None]
    assert out[2] == pytest.approx(2.0)
    assert out[3] == pytest.approx(3.0)
    assert out[4] == pytest.approx(4.0)


def test_rsi_all_gains_is_100():
    closes = [float(i) for i in range(1, 30)]   # strictly increasing
    out = rsi(closes, period=14)
    assert out[:14] == [None] * 14
    assert out[14] == pytest.approx(100.0)
    assert out[-1] == pytest.approx(100.0)


def test_rsi_all_losses_is_0():
    closes = [float(i) for i in range(30, 1, -1)]  # strictly decreasing
    out = rsi(closes, period=14)
    assert out[14] == pytest.approx(0.0)


def test_breakout_up_and_down():
    vals = [10, 10, 10, 10, 12, 8]
    out = breakout(vals, window=4)
    assert out[4] == 1     # 12 > max(prior 4) = 10
    assert out[5] == -1    # 8 < min(prior 4)


def test_bad_window_raises():
    with pytest.raises(ValueError):
        sma([1, 2, 3], 0)
