"""Clean-room technical indicators.

These are standard public-domain formulas (SMA, Wilder's RSI, Donchian
breakout) implemented from their mathematical definitions. No third-party or
TradingView/Pine source was copied. Pure Python, no numpy, fully unit-tested.

Concepts (what an indicator measures) are ideas and not copyrightable; only a
specific expression of code is. We implement the concept, not anyone's code.
See docs/strategy-concepts.md for the policy and the concept catalog.
"""

from __future__ import annotations

from collections import deque
from typing import Optional


def sma(values: list[float], window: int) -> list[Optional[float]]:
    """Simple moving average. out[i] is the mean of the trailing ``window`` values,
    or None until enough history exists."""
    if window <= 0:
        raise ValueError("window must be positive")
    out: list[Optional[float]] = [None] * len(values)
    q: deque[float] = deque()
    s = 0.0
    for i, v in enumerate(values):
        q.append(v)
        s += v
        if len(q) > window:
            s -= q.popleft()
        if len(q) == window:
            out[i] = s / window
    return out


def rsi(closes: list[float], period: int = 14) -> list[Optional[float]]:
    """Wilder's Relative Strength Index. out[i] is None until ``period`` changes
    exist. Pure gains -> 100, pure losses -> 0."""
    if period <= 0:
        raise ValueError("period must be positive")
    n = len(closes)
    out: list[Optional[float]] = [None] * n
    if n <= period:
        return out
    gains = [max(closes[i] - closes[i - 1], 0.0) for i in range(1, n)]
    losses = [max(closes[i - 1] - closes[i], 0.0) for i in range(1, n)]

    def rsi_val(ag: float, al: float) -> float:
        if al == 0:
            return 100.0
        rs = ag / al
        return 100.0 - 100.0 / (1.0 + rs)

    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    out[period] = rsi_val(avg_g, avg_l)
    for i in range(period + 1, n):
        avg_g = (avg_g * (period - 1) + gains[i - 1]) / period
        avg_l = (avg_l * (period - 1) + losses[i - 1]) / period
        out[i] = rsi_val(avg_g, avg_l)
    return out


def breakout(values: list[float], window: int) -> list[int]:
    """Donchian-style breakout: +1 when a value exceeds the max of the prior
    ``window``, -1 below the prior min, else 0."""
    if window <= 0:
        raise ValueError("window must be positive")
    out = [0] * len(values)
    for i in range(window, len(values)):
        prior = values[i - window:i]
        if values[i] > max(prior):
            out[i] = 1
        elif values[i] < min(prior):
            out[i] = -1
    return out
