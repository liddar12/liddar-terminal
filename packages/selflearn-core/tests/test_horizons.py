"""Horizon definition tests."""

import pytest

from selflearn_core.horizons import (
    TRADING_DAYS,
    horizon_days,
    horizon_seconds,
    ordered_labels,
)


def test_labels_ordered_short_to_long_with_max_last():
    assert ordered_labels() == ["1d", "5d", "1m", "3m", "6m", "1y", "5y", "max"]


def test_known_day_counts():
    assert horizon_days("1d") == 1
    assert horizon_days("1y") == 252
    assert horizon_days("max") is None


def test_max_seconds_uses_total_days():
    assert horizon_seconds("max", total_days=500) == 500 * 86400
    assert horizon_seconds("5d") == 5 * 86400


def test_unknown_label_raises():
    with pytest.raises(KeyError):
        horizon_days("2w")
