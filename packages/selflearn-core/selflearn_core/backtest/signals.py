"""Signals: turn a price_action feature snapshot into a directional call.

A signal is a pure function ``features -> (direction, confidence) | None``.
``None`` means "no trade this bar" — a signal is allowed to abstain, and a
walk-forward that only scores the bars it acted on is the honest way to measure a
selective rule.

``trend_signal`` is a plain momentum rule (no fitting), so the walk-forward it
feeds has zero train/test leakage by construction. It exists to exercise the
harness end-to-end, not as a claim of edge.
"""

from __future__ import annotations

from typing import Optional


def trend_signal(features: dict) -> Optional[tuple[str, float]]:
    """Long when price is above its 20-bar mean *and* the fast SMA is above the
    slow one; short when both are below; abstain otherwise. Confidence scales
    with 10-bar momentum, capped."""
    if "trend_20" not in features or "sma_cross" not in features:
        return None  # not enough history yet
    trend = features["trend_20"]
    cross = features["sma_cross"]
    if trend > 0 and cross > 0:
        direction = "long"
    elif trend < 0 and cross < 0:
        direction = "short"
    else:
        return None  # mixed → no trade
    strength = abs(features.get("mom_10", 0.0))
    confidence = max(0.0, min(1.0, 0.5 + 5.0 * strength))
    return direction, confidence
