"""Market-data provider interface.

Concrete adapters (Polygon, Databento, Tiingo, Alpha Vantage, CBOE/ORATS for
options, etc.) implement this once a provider + key is chosen, following the
same network-isolated, injectable-fetch pattern as the EIA/ISO clients so the
parsing stays unit-testable. See docs/data-sources.md for the candidate
providers, what each supplies, and the allowlist requirement.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Bar:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataProvider(ABC):
    """Uniform read interface over a licensed data vendor."""

    @abstractmethod
    def daily_bars(self, symbol: str, start: str, end: str) -> list[Bar]:
        """Daily OHLCV bars for a symbol over [start, end] (ISO dates)."""

    @abstractmethod
    def option_chain(self, symbol: str, expiry: Optional[str] = None) -> list[dict]:
        """Option chain for a symbol (optionally a single expiry).

        Left as list[dict] until a provider is chosen and its schema is fixed;
        a typed OptionQuote record replaces it then.
        """
