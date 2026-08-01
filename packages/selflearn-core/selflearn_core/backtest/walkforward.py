"""Walk-forward runner: features from the past, outcome from the future, no leak.

At each eligible bar ``i`` it builds a PriceActionPack snapshot as of that bar
(the pack guarantees only bars with ``ts <= bars[i].ts`` are used), asks the
signal for a call, logs a Prediction, and — once ``horizon_bars`` have elapsed —
resolves it against the realized forward return. Features never see the future;
only the resolver does, and only after the horizon. That is the whole no-lookahead
contract, enforced structurally.
"""

from __future__ import annotations

from typing import Callable, Optional

from ..features.bars import BarSource
from ..features.price_action import PriceActionPack
from ..types import Outcome, Prediction, ResolvedPrediction

Signal = Callable[[dict], Optional[tuple[str, float]]]

_FAR_FUTURE = 10**18


def run_walkforward(
    source: BarSource,
    symbol: str,
    signal: Signal,
    horizon_bars: int,
    lookback_bars: int = 60,
    warmup_bars: int = 25,
    step: int = 1,
) -> list[ResolvedPrediction]:
    """Run ``signal`` over every ``step``-th bar from ``warmup_bars`` onward,
    resolving each call ``horizon_bars`` ahead. Returns the resolved predictions
    the signal actually made (abstentions are skipped)."""
    bars = source.bars(symbol, _FAR_FUTURE, 0)  # full history, ascending
    pack = PriceActionPack(source, lookback_bars=lookback_bars)
    resolved: list[ResolvedPrediction] = []

    last_i = len(bars) - horizon_bars - 1  # need bars[i + horizon] to exist
    for i in range(warmup_bars, last_i + 1, step):
        as_of = bars[i].ts
        snap = pack.snapshot(symbol, as_of)
        call = signal(snap.values)
        if call is None:
            continue
        direction, confidence = call

        pred = Prediction(
            id=f"{symbol}:{as_of}",
            ts=as_of,
            model_version="price_action_trend/v0",
            task="price_action_trend",
            features=snap.values,
            prediction={"direction": direction},
            horizon_s=bars[i + horizon_bars].ts - as_of,
            confidence=confidence,
            cohort=symbol,
        )

        entry = bars[i].close
        exit_ = bars[i + horizon_bars].close
        fwd = exit_ / entry - 1.0 if entry else 0.0
        correct = (direction == "long" and fwd > 0) or (direction == "short" and fwd < 0)
        signed = fwd if direction == "long" else -fwd  # PnL in the traded direction

        outcome = Outcome(
            prediction_id=pred.id,
            resolved_ts=bars[i + horizon_bars].ts,
            realized={"fwd_return": fwd, "signed_return": signed, "correct": correct},
        )
        resolved.append(ResolvedPrediction(prediction=pred, outcome=outcome))

    return resolved
