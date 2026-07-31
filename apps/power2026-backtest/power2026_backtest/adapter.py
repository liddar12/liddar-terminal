"""Concrete PowerBacktestAdapter: bridges hypothesis forward-predictions into
selflearn-core. Subclasses the core's adapter contract.

Construction (task name, wiring to the store) is set up now; predict/resolve
bodies stay deferred to Gate 2 with H1's data fit, matching the base class.
"""

from __future__ import annotations

from typing import Any, Optional

from selflearn_core.adapters import PowerBacktestAdapter as _BasePowerAdapter
from selflearn_core.types import Outcome, Prediction


class PowerBacktestAdapter(_BasePowerAdapter):
    """H1..H4 forward predictions -> selflearn-core (logged at Level 0)."""

    def predict(self, context: Any) -> Prediction:
        raise NotImplementedError("Gate 2: build a Prediction from an H1 fold forecast.")

    def resolve_outcome(self, prediction: Prediction) -> Optional[Outcome]:
        raise NotImplementedError("Gate 2: resolve against realized LMP once horizon elapses.")
