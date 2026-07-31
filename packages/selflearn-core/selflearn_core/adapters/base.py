"""Adapter interface. Each project implements exactly two methods; the core
handles storage, scoring, registry, and the feedback loop around them.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from ..types import Outcome, Prediction


class Adapter(ABC):
    """Bridge a project's model to selflearn-core.

    ``predict`` returns a log-ready Prediction (features must obey no-lookahead).
    ``resolve_outcome`` returns the realized Outcome once the horizon has
    elapsed, or None if it has not.
    """

    @abstractmethod
    def predict(self, context: Any) -> Prediction:
        ...

    @abstractmethod
    def resolve_outcome(self, prediction: Prediction) -> Optional[Outcome]:
        ...
