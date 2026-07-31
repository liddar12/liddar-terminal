"""PowerBacktestAdapter: logs each hypothesis's forward prediction; resolves
against the realized LMP.

Bodies unlock at Gate 2 (H1 walk-forward). Signatures fixed now.
"""

from __future__ import annotations

from typing import Any, Optional

from ..types import Outcome, Prediction
from .base import Adapter


class PowerBacktestAdapter(Adapter):
    task = "power_backtest"

    def predict(self, context: Any) -> Prediction:
        raise NotImplementedError("Gate 2: log a hypothesis forward prediction.")

    def resolve_outcome(self, prediction: Prediction) -> Optional[Outcome]:
        raise NotImplementedError("Gate 2: resolve against realized LMP.")
