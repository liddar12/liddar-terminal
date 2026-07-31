"""PriceActionPack: candles, volume, and trend → point-in-time features.

The math is a pure function of a bar series (``compute_price_action_features``),
so it is deterministic and unit-testable with no data dependency. The pack pulls
bars from a :class:`BarSource` up to ``as_of_ts`` and stamps every feature's
observation time to the last closed bar — so a snapshot can never reference a
candle from the future (guardrail §6, no lookahead).

Features degrade gracefully: with too little history, only the features that can
be honestly computed are returned. Nothing is faked or forward-filled.
"""

from __future__ import annotations

import statistics
from typing import Optional

from .bars import Bar, BarSource
from .base import FeatureFamily, FeaturePack, FeatureSnapshot


def _rsi(closes: list[float], period: int = 14) -> Optional[float]:
    """Classic RSI over the last ``period`` deltas. 0–100; 100 if no losses."""
    if len(closes) < period + 1:
        return None
    gains = 0.0
    losses = 0.0
    for i in range(len(closes) - period, len(closes)):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    avg_gain = gains / period
    avg_loss = losses / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def _atr(bars: list[Bar], period: int = 14) -> Optional[float]:
    """Average True Range over the last ``period`` bars (needs one prior close)."""
    if len(bars) < period + 1:
        return None
    trs: list[float] = []
    for i in range(len(bars) - period, len(bars)):
        high, low, prev_close = bars[i].high, bars[i].low, bars[i - 1].close
        trs.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
    return statistics.fmean(trs)


def compute_price_action_features(bars: list[Bar]) -> dict[str, float]:
    """Technicals from an ascending list of closed bars. Only what the history
    supports is returned; each key is knowable at the last bar's close."""
    n = len(bars)
    if n == 0:
        return {}
    closes = [b.close for b in bars]
    vols = [b.volume for b in bars]
    last = bars[-1]
    f: dict[str, float] = {"close": closes[-1], "volume": vols[-1]}

    if last.close:
        f["range_pct"] = (last.high - last.low) / last.close
    if n >= 2 and closes[-2]:
        f["ret_1"] = closes[-1] / closes[-2] - 1.0
        f["gap"] = last.open / closes[-2] - 1.0
    if n >= 6 and closes[-6]:
        f["ret_5"] = closes[-1] / closes[-6] - 1.0
    if n >= 10:
        f["sma_10"] = statistics.fmean(closes[-10:])
    if n >= 11 and closes[-11]:
        f["mom_10"] = closes[-1] / closes[-11] - 1.0
    if n >= 20:
        sma_20 = statistics.fmean(closes[-20:])
        f["sma_20"] = sma_20
        if sma_20:
            f["trend_20"] = closes[-1] / sma_20 - 1.0
            if "sma_10" in f:
                f["sma_cross"] = f["sma_10"] / sma_20 - 1.0
        avg_vol = statistics.fmean(vols[-20:])
        if avg_vol:
            f["vol_ratio_20"] = vols[-1] / avg_vol
    if n >= 15:
        rsi = _rsi(closes, 14)
        if rsi is not None:
            f["rsi_14"] = rsi
        atr = _atr(bars, 14)
        if atr is not None and last.close:
            f["atr_pct_14"] = atr / last.close
    if n >= 21:
        rets = [
            closes[i] / closes[i - 1] - 1.0
            for i in range(len(closes) - 20, len(closes))
            if closes[i - 1]
        ]
        if len(rets) >= 2:
            f["realized_vol_20"] = statistics.pstdev(rets)
    return f


class PriceActionPack(FeaturePack):
    """Candles/volume/trend features for a symbol, as of a point in time."""

    family = FeatureFamily.PRICE_ACTION
    name = "price_action"

    def __init__(self, source: BarSource, lookback_bars: int = 60) -> None:
        self.source = source
        self.lookback_bars = lookback_bars

    def snapshot(self, symbol: str, as_of_ts: int) -> FeatureSnapshot:
        bars = [
            b
            for b in self.source.bars(symbol, as_of_ts, self.lookback_bars)
            if b.ts <= as_of_ts  # defensive: never trust a source past as_of_ts
        ]
        bars.sort(key=lambda b: b.ts)
        values = compute_price_action_features(bars)
        obs = bars[-1].ts if bars else as_of_ts
        return FeatureSnapshot(
            pack=self.name,
            family=self.family,
            as_of_ts=as_of_ts,
            values=values,
            obs_ts={k: obs for k in values},
        )
