"""H1: gas sets the price.

Claim: in a gas-marginal ISO, day-ahead LMP tracks
``implied_heat_rate * Henry_Hub``. Method: regress DA price on gas price
(walk-forward); recover the implied heat rate (slope).

Acceptance (brief Section 3): slope in a plausible band (~6..12) with R^2
reported, by ISO/zone.

v1 simplification (documented, not hidden): we regress on *daily-mean* DA price
vs daily gas rather than conditioning on gas-marginal *hours*. That's the first
pass; hour-level conditioning is a later refinement (VERIFY against intraday data).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

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
    """Ordinary least squares for y ~ a + b*x. Returns (slope, intercept, r2).

    Pure Python (no numpy) so it runs and is tested with zero installs.
    """
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
) -> list[H1Result]:
    """Walk-forward H1 over [start, end] for one ISO.

    Pulls gas (EIA) + DA price (ISO), aligns on date, and for each walk-forward
    fold fits the implied heat rate and emits an H1Result. If ``store`` is given
    (a selflearn-core StorageBackend), each fold's forward prediction is logged
    and immediately resolved against the realized test-window price (Level 0:
    log + score, change nothing).
    """
    eia = eia or EiaClient()
    iso_client = iso_client or IsoClient(iso=iso)

    gas = eia.henry_hub_daily(start, end)
    power = iso_client.day_ahead_lmp(start, end)
    merged = align(gas, power)
    if len(merged) < min_points:
        raise ValueError(f"only {len(merged)} aligned days; need >= {min_points}")

    results: list[H1Result] = []
    for sp in rolling_splits(0, len(merged), train_size, test_size):
        train = merged[sp.train_start:sp.train_end]
        test = merged[sp.test_start:sp.test_end]
        slope, intercept, r2 = ols([g for _, g, _ in train], [p for _, _, p in train])
        results.append(H1Result(iso, slope, r2, len(train)))

        if store is not None:
            from selflearn_core.types import Outcome, Prediction

            test_gas = _mean([g for _, g, _ in test])
            pred_lmp = intercept + slope * test_gas
            realized_lmp = _mean([p for _, _, p in test])
            pid = store.append_prediction(
                Prediction(
                    id=str(uuid4()),
                    ts=_epoch(train[-1][0]),
                    model_version="h1.v0",
                    task="power_backtest",
                    features={
                        "train_n": len(train),
                        "implied_heat_rate": slope,
                        "train_end": train[-1][0],
                    },
                    prediction={"lmp_hat": pred_lmp},
                    horizon_s=test_size * 86400,
                    confidence=max(0.0, min(1.0, r2)),
                    cohort=iso,
                )
            )
            store.attach_outcome(
                Outcome(
                    prediction_id=pid,
                    resolved_ts=_epoch(test[-1][0]),
                    realized={"lmp": realized_lmp, "abs_err": abs(pred_lmp - realized_lmp)},
                )
            )
    return results
