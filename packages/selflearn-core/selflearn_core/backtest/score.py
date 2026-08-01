"""Scoring for walk-forward results — with the sample size and interval that make
a hit-rate honest. A 60% hit rate on n=12 is noise; the CI says so.
"""

from __future__ import annotations

import math
import statistics

from ..types import ResolvedPrediction, Score


def wilson_ci(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval for a proportion k/n. Correct in small samples where
    the naive p ± z·sqrt(p(1-p)/n) runs off the ends of [0, 1]."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1.0 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))


def score_resolved(
    resolved: list[ResolvedPrediction],
    cohort: str,
    window: str = "all",
    model_version: str = "price_action_trend/v0",
) -> list[Score]:
    """Hit rate (with Wilson CI) and mean signed return (with a normal CI) over a
    set of resolved predictions. Returns an empty list for an empty set."""
    n = len(resolved)
    if n == 0:
        return []
    k = sum(1 for r in resolved if r.outcome.realized["correct"])
    hit = k / n
    lo, hi = wilson_ci(k, n)

    signed = [r.outcome.realized["signed_return"] for r in resolved]
    mean_ret = statistics.fmean(signed)
    if n >= 2:
        se = statistics.pstdev(signed) / math.sqrt(n)
        r_lo, r_hi = mean_ret - 1.96 * se, mean_ret + 1.96 * se
    else:
        r_lo = r_hi = None

    return [
        Score(
            task="price_action_trend", metric="hit_rate", value=hit, n=n,
            window=window, cohort=cohort, ci_low=lo, ci_high=hi,
            model_version=model_version,
        ),
        Score(
            task="price_action_trend", metric="mean_signed_return", value=mean_ret,
            n=n, window=window, cohort=cohort, ci_low=r_lo, ci_high=r_hi,
            model_version=model_version,
        ),
    ]
