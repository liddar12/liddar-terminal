"""Core records for the self-learning loop.

These types are fully implemented at Gate 1 (they carry no behavior beyond
construction/serialization), so the whole package imports and the contracts are
stable for the store, scorer, registry, updater, and adapters to build against.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class Prediction:
    """An append-only prediction record.

    Invariant (no lookahead): everything in ``features`` must be knowable at
    ``ts``. Adapters construct these and are responsible for honoring it; tests
    assert it.
    """

    id: str
    ts: int  # unix seconds, prediction time
    model_version: str
    task: str  # 'scanner' | 'power_h1' | ...
    features: dict[str, Any]
    prediction: Any  # direction / price / etc.
    horizon_s: int  # seconds until resolvable
    confidence: Optional[float] = None
    cohort: Optional[str] = None  # ticker / ISO / regime bucket
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Outcome:
    """The realized result attached to a prediction once its horizon elapsed."""

    prediction_id: str
    resolved_ts: int
    realized: Any
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResolvedPrediction:
    """A prediction joined to its outcome. The unit the scorer consumes."""

    prediction: Prediction
    outcome: Outcome


@dataclass(frozen=True)
class Score:
    """A single metric value with the sample size and interval behind it.

    Every score carries ``n`` and a confidence interval so callers never quote a
    point hit-rate on a tiny sample (small-sample honesty, guardrail Section 6).
    """

    task: str
    metric: str
    value: float
    n: int
    window: str  # e.g. 'rolling_30d' | 'all'
    cohort: Optional[str] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    model_version: Optional[str] = None
