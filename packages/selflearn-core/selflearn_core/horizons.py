"""Backtest / holding horizons shared across workstreams.

One canonical definition of the 1d..max horizons so the power backtest, the
scanner, and (later) execution all score against the same windows. Values are
trading-day approximations; VERIFY against a real trading calendar before you
rely on exact counts in production.

A horizon means two compatible things here:
- the holding/prediction horizon (how far forward a signal is evaluated), used
  as a prediction's ``horizon_s``; and
- the evaluation window label carried on every ``Score`` (score by window).
"""

from __future__ import annotations

from typing import Optional

# label -> trading days; 'max' means "all available history" (None sentinel).
TRADING_DAYS: dict[str, Optional[int]] = {
    "1d": 1,
    "5d": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "1y": 252,
    "5y": 1260,
    "max": None,
}

SECONDS_PER_DAY = 86400


def ordered_labels() -> list[str]:
    """Horizon labels shortest to longest ('max' last)."""
    return list(TRADING_DAYS.keys())


def horizon_days(label: str) -> Optional[int]:
    if label not in TRADING_DAYS:
        raise KeyError(f"unknown horizon {label!r}; known: {list(TRADING_DAYS)}")
    return TRADING_DAYS[label]


def horizon_seconds(label: str, total_days: Optional[int] = None) -> int:
    """Holding horizon in seconds. 'max' resolves to ``total_days`` (available history)."""
    d = horizon_days(label)
    if d is None:  # 'max'
        d = total_days or 0
    return d * SECONDS_PER_DAY
