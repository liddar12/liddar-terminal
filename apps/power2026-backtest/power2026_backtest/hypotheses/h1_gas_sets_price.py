"""H1: gas sets the price.

Claim: in a gas-marginal ISO, day-ahead LMP tracks
``implied_heat_rate * Henry_Hub``. Method: regress DA price on gas price
(walk-forward); recover the implied heat rate (slope).

Acceptance (brief Section 3): slope in a plausible band (~6..12) with R^2
reported, by ISO/zone.

v1 simplification (documented, not hidden): we regress on *daily-mean* DA price
vs daily gas rather than conditioning on gas-marginal *hours*. That's the first
pass; hour-level conditioning is a later refinement (VERIFY against intraday data).

Multi-horizon: run_h1_multi evaluates the relationship across the shared
1d..max horizons, tagging each logged prediction with its horizon so scores can
be grouped by window.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from selflearn_core.horizons import TRADING_DAYS, ordered_labels

from ..data import EiaClient, IsoClient
from ..walkforward import rolling_splits

# Plausible implied-heat-rate band for a gas-marginal region.
HEAT_RATE_BAND = (6.0, 12.0)


@dataclass(frozen=True)
class H1Result:
    iso: str
    slope: float          # implied heat rate
    r_squared: float
    n: int                # observations in the training fold
    horizon: Optional[str] = None  # horizon label when run multi-horizon

    def passes(self) -> bool:
        """Acceptance: slope inside the plausible band."""
        lo, hi = HEAT_RATE_BAND
        return lo <= self.slope <= hi


def align(
    gas: list[tuple[str, float]], power: list[tuple[str, float]]
) -> list[tuple[str, float, float]]:
    """Inner-join two (date, value) series on date -> sorted [(date, gas, power)]."""
    gd = dict(gas)
    pd = dict(power)
    return [(d, gd[d], pd[d]) for d in sorted(set(gd) & set(pd))]


def ols(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """OLS for y ~ a + b*x. Returns (slope, intercept, r2). Pure Python, no numpy."""
    n = len(xs)
    if n < 2:
        raise ValueError("need at least 2 points")
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        raise ValueError("no variance in x")
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx
    intercept = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return slope, intercept, r2


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals)


def _epoch(d: str) -> int:
    return int(
        datetime.strptime(d[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()
    )


def _fetch_merged(
    iso: str, start: str, end: str, eia: Optional[EiaClient], iso_client: Optional[IsoClient]
) -> list[tuple[str, float, float]]:
    eia = eia or EiaClient()
    iso_client = iso_client or IsoClient(iso=iso)
    return align(eia.henry_hub_daily(start, end), iso_client.day_ahead_lmp(start, end))


def _log_fold(store, iso, horizon_label, train, test, slope, intercept) -> None:
    """Log one fold's forward prediction and resolve it against realized price (L0)."""
    from selflearn_core.types import Outcome, Prediction

    test_gas = _mean([g for _, g, _ in test])
    pred_lmp = intercept + slope * test_gas
    realized_lmp = _mean([p for _, _, p in test])
    version = "h1.v0" + (f"/{horizon_label}" if horizon_label else "")
    pid = store.append_prediction(
        Prediction(
            id=str(uuid4()),
            ts=_epoch(train[-1][0]),
            model_version=version,
            task="power_backtest",
            features={"train_n": len(train), "implied_heat_rate": slope, "train_end": train[-1][0]},
            prediction={"lmp_hat": pred_lmp},
            horizon_s=(len(test)) * 86400,
            confidence=None,
            cohort=iso,
            meta={"horizon": horizon_label} if horizon_label else {},
        )
    )
    store.attach_outcome(
        Outcome(
            prediction_id=pid,
            resolved_ts=_epoch(test[-1][0]),
            realized={"lmp": realized_lmp, "abs_err": abs(pred_lmp - realized_lmp)},
        )
    )


def run_h1(
    iso: str,
    start: str,
    end: str,
    *,
    eia: Optional[EiaClient] = None,
    iso_client: Optional[IsoClient] = None,
    store=None,
    train_size: int = 60,
    test_size: int = 20,
    min_points: int = 80,
    horizon_label: Optional[str] = None,
    merged: Optional[list[tuple[str, float, float]]] = None,
) -> list[H1Result]:
    """Walk-forward H1 for one ISO (optionally one horizon).

    Pass ``merged`` to reuse an already-fetched/aligned series (run_h1_multi does
    this to fetch once). With ``store`` set, each fold is logged and resolved at L0.
    """
    if merged is None:
        merged = _fetch_merged(iso, start, end, eia, iso_client)
    if len(merged) < min_points:
        raise ValueError(f"only {len(merged)} aligned days; need >= {min_points}")

    results: list[H1Result] = []
    for sp in rolling_splits(0, len(merged), train_size, test_size):
        train = merged[sp.train_start:sp.train_end]
        test = merged[sp.test_start:sp.test_end]
        slope, intercept, r2 = ols([g for _, g, _ in train], [p for _, _, p in train])
        results.append(H1Result(iso, slope, r2, len(train), horizon_label))
        if store is not None:
            _log_fold(store, iso, horizon_label, train, test, slope, intercept)
    return results


def run_h1_multi(
    iso: str,
    start: str,
    end: str,
    *,
    horizons: Optional[list[str]] = None,
    eia: Optional[EiaClient] = None,
    iso_client: Optional[IsoClient] = None,
    store=None,
    train_size: int = 60,
) -> dict:
    """Run H1 across the shared 1d..max horizons.

    Returns {"results": {label: [H1Result, ...]}, "skipped": [labels]}. A horizon
    is skipped (never silently) when the available history can't fit
    ``train_size`` + that horizon's test window. 'max' is a single full-sample
    (in-sample) fit describing the whole-history relationship.
    """
    labels = horizons or ordered_labels()
    merged = _fetch_merged(iso, start, end, eia, iso_client)

    results: dict[str, list[H1Result]] = {}
    skipped: list[str] = []
    for label in labels:
        days = TRADING_DAYS[label]
        if days is None:  # 'max': one in-sample fit over all history
            if len(merged) < 2:
                skipped.append(label)
                continue
            slope, intercept, r2 = ols([g for _, g, _ in merged], [p for _, _, p in merged])
            results[label] = [H1Result(iso, slope, r2, len(merged), label)]
            if store is not None:
                _log_fold(store, iso, label, merged, merged, slope, intercept)
            continue
        if train_size + days > len(merged):
            skipped.append(label)
            continue
        results[label] = run_h1(
            iso, start, end, store=store, train_size=train_size, test_size=days,
            min_points=train_size + days, horizon_label=label, merged=merged,
        )
    return {"results": results, "skipped": skipped}
