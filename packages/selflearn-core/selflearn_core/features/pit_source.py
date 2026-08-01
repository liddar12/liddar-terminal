"""Point-in-time series source: the machinery that makes macro no-lookahead real.

Macro/commodity series have two clocks — the *reference period* (the month a CPI
describes) and the *release datetime* (when it was published, and later revised).
Reading the final revised value at a historical date is lookahead. So a series is
stored as a list of **releases**, and ``observe(series_id, as_of_ts)`` returns the
value **as it stood at as_of_ts** — the latest release whose ``release_ts <=
as_of_ts``. That single rule is what keeps every macro backtest honest.

``InMemoryPitSource`` is real and tested. ``FredSeriesSource`` / ``EiaSeriesSource``
are deferred: they raise, naming the gate, rather than invent an endpoint.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Release:
    """One publication of a series value. ``release_ts`` is when it became known;
    ``value`` is the number as first (or then-current) reported; ``consensus`` is
    the pre-release expectation, if any (for surprise features)."""

    release_ts: int
    value: float
    ref_ts: Optional[int] = None
    consensus: Optional[float] = None


@dataclass(frozen=True)
class Observation:
    """What the world knew about a series at ``as_of_ts``."""

    series_id: str
    value: float
    obs_ts: int  # = the release_ts of the release in effect (never > as_of_ts)
    consensus: Optional[float] = None

    @property
    def surprise(self) -> Optional[float]:
        """Actual − consensus, or None if no consensus was recorded."""
        return None if self.consensus is None else self.value - self.consensus


class PitSeriesSource(ABC):
    """Vintage-aware series access. One method; the point-in-time rule lives here."""

    @abstractmethod
    def observe(self, series_id: str, as_of_ts: int) -> Optional[Observation]:
        """Latest release with ``release_ts <= as_of_ts``, or None if none/unknown."""
        ...


class InMemoryPitSource(PitSeriesSource):
    """Releases held in memory, sorted by publication time. Point-in-time by
    construction — it never returns a release from the future."""

    def __init__(self) -> None:
        self._series: dict[str, list[Release]] = {}

    def add_release(
        self,
        series_id: str,
        release_ts: int,
        value: float,
        ref_ts: Optional[int] = None,
        consensus: Optional[float] = None,
    ) -> None:
        rel = Release(release_ts, value, ref_ts, consensus)
        seq = self._series.setdefault(series_id, [])
        seq.append(rel)
        seq.sort(key=lambda r: r.release_ts)

    def observe(self, series_id: str, as_of_ts: int) -> Optional[Observation]:
        latest: Optional[Release] = None
        for rel in self._series.get(series_id, []):
            if rel.release_ts <= as_of_ts:
                latest = rel  # list is sorted, so the last qualifying wins
            else:
                break
        if latest is None:
            return None
        return Observation(
            series_id=series_id,
            value=latest.value,
            obs_ts=latest.release_ts,
            consensus=latest.consensus,
        )


class FredSeriesSource(PitSeriesSource):
    """FRED/ALFRED vintage data. [VERIFY series ids + ALFRED vintage params.]"""

    def observe(self, series_id: str, as_of_ts: int) -> Optional[Observation]:
        raise NotImplementedError(
            "Gate 3+: fetch the FRED/ALFRED vintage in effect at as_of_ts (free key)."
        )


class EiaSeriesSource(PitSeriesSource):
    """EIA API v2 storage/price series, dated to their fixed release datetimes.
    [VERIFY endpoints + release schedule.]"""

    def observe(self, series_id: str, as_of_ts: int) -> Optional[Observation]:
        raise NotImplementedError(
            "Gate 3+: fetch EIA series with obs_ts = release datetime (free key)."
        )
