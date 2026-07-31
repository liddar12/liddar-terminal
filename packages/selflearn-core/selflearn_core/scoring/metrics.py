"""Scoring. Metrics on resolved predictions only, always by cohort + window,
always with sample size and a confidence interval.

Bodies unlocked at Gate 3 (scorer + calibration go live). Signatures fixed now
so the store, registry, and adapters build against a stable contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..types import ResolvedPrediction, Score


@dataclass(frozen=True)
class TaskSpec:
    """Describes how a task is scored.

    kind='regression' -> MAE, MAPE, R^2, sign accuracy.
    kind='idea'       -> hit rate, realized PnL, Brier score on confidence.
    """

    task: str
    kind: str  # 'regression' | 'idea'
    windows: tuple[str, ...] = ("rolling_30d", "all")


def score_task(resolved: Iterable[ResolvedPrediction], spec: TaskSpec) -> list[Score]:
    """Compute per-cohort, per-window scores. Every Score carries n + CI."""
    raise NotImplementedError("Gate 3: scorer implementation.")
