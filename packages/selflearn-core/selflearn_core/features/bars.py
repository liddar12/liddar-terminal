"""Bar series and the source that supplies it.

A ``Bar`` is one OHLCV candle. Its ``ts`` is the bar's **close time** — the
instant its values become known — which is the anchor that makes no-lookahead
checkable: a bar may enter a prediction only once ``ts <= as_of_ts``.

``BarSource`` is the seam between the pure feature math and where candles come
from. ``InMemoryBarSource`` is real and tested (backtests, unit tests);
``SchwabBarSource`` is deferred to Gate 5, mirroring the Broker/StorageBackend
pattern (one ABC, a sim/in-memory impl now, the live impl behind a gate).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class Bar:
    """One OHLCV candle. ``ts`` = bar close time (when the values are known)."""

    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class BarSource(ABC):
    """Supplies closed bars for a symbol, oldest→newest, never past ``end_ts``."""

    @abstractmethod
    def bars(self, symbol: str, end_ts: int, lookback: int) -> list[Bar]:
        """Return up to ``lookback`` most-recent bars with ``ts <= end_ts``,
        in ascending time order. ``lookback <= 0`` means all available."""
        ...


class InMemoryBarSource(BarSource):
    """Bars held in memory. The backtest/test source; also the shape a cache or
    a file-backed source would take. Point-in-time by construction: it filters
    to ``ts <= end_ts`` on every read."""

    def __init__(self, series: dict[str, list[Bar]] | None = None) -> None:
        self._series: dict[str, list[Bar]] = {}
        for symbol, bars in (series or {}).items():
            self.add(symbol, bars)

    def add(self, symbol: str, bars: list[Bar]) -> None:
        merged = self._series.get(symbol, []) + list(bars)
        self._series[symbol] = sorted(merged, key=lambda b: b.ts)

    def bars(self, symbol: str, end_ts: int, lookback: int) -> list[Bar]:
        eligible = [b for b in self._series.get(symbol, []) if b.ts <= end_ts]
        if lookback and lookback > 0:
            return eligible[-lookback:]
        return eligible


class SchwabBarSource(BarSource):
    """Live candles from the Schwab Trader API. [VERIFY surface + rate limits.]"""

    def bars(self, symbol: str, end_ts: int, lookback: int) -> list[Bar]:
        raise NotImplementedError(
            "Gate 5: fetch OHLCV bars from Schwab (only bars closed at/<= end_ts)."
        )
