"""Confidence calibration. The mechanism behind the L1 updater: make 'HIGH'
mean what the data says it means.

Bodies unlocked at Gate 3. scikit-learn is an optional dependency (install the
``scoring`` extra) so the Gate 1 scaffold imports with no third-party packages.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable

from ..types import ResolvedPrediction


class Calibrator(ABC):
    @abstractmethod
    def apply(self, confidence: float) -> float:
        """Map a raw confidence to a calibrated probability."""


def fit_calibrator(resolved: Iterable[ResolvedPrediction], method: str = "isotonic") -> Calibrator:
    """Fit Platt (logistic) or isotonic calibration on resolved predictions."""
    raise NotImplementedError("Gate 3: calibration implementation (needs scikit-learn).")
