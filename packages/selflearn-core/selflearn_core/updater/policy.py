"""Feedback policies with staged autonomy. The updater turns scores into
proposed changes; it never applies them without a manual gate, and it stays at
Level 0 for a task until that task has ``min_resolved`` resolved outcomes
(default 30, guardrail Section 6).

Levels:
  L0 monitor only (no-op)         <- start here, always safe
  L1 calibration layer            <- default target
  L2 weight/ensemble adjustment
  L3 prompt/param optimization
  L4 trained meta-model

Bodies for L1..L4 unlock across Gates 3+. L0 is implemented now: it is the
no-op, and being able to run L0 is the point of "monitor only".
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Iterable

from ..types import Score

DEFAULT_MIN_RESOLVED = 30  # TODO(jimmy): confirm threshold


@dataclass(frozen=True)
class Change:
    """A proposed change. Never auto-applied; requires a manual gate."""

    task: str
    kind: str  # 'calibrate' | 'reweight' | 'param' | 'meta'
    detail: dict[str, Any]
    rationale: str


class UpdatePolicy(ABC):
    level: int

    @abstractmethod
    def propose(self, scores: Iterable[Score]) -> list[Change]:
        """Inspect scores; return proposed changes (possibly empty)."""


class Level0Monitor(UpdatePolicy):
    """Log and score, change nothing. Fully implemented: the no-op is the job."""

    level = 0

    def propose(self, scores: Iterable[Score]) -> list[Change]:
        return []


class Level1Calibration(UpdatePolicy):
    level = 1

    def propose(self, scores: Iterable[Score]) -> list[Change]:
        raise NotImplementedError("Gate 3: calibration policy.")


class Level2Ensemble(UpdatePolicy):
    level = 2

    def propose(self, scores: Iterable[Score]) -> list[Change]:
        raise NotImplementedError("Later gate: ensemble reweighting.")


class Level3ParamOpt(UpdatePolicy):
    level = 3

    def propose(self, scores: Iterable[Score]) -> list[Change]:
        raise NotImplementedError("Later gate: prompt/param optimization.")


class Level4MetaModel(UpdatePolicy):
    level = 4

    def propose(self, scores: Iterable[Score]) -> list[Change]:
        raise NotImplementedError("Later gate: trained meta-model.")
