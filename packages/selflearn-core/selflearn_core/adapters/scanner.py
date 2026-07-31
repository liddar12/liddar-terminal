"""ScannerAdapter: wraps the existing Liddar AI Calls/Puts output.

Each idea (ticker, direction, strike, expiry, confidence) becomes a Prediction;
it resolves against the realized price move over the idea's horizon.

Bodies unlock at Gate 4 (scanner integration). Signatures fixed now.
"""

from __future__ import annotations

from typing import Any, Optional

from ..types import Outcome, Prediction
from .base import Adapter


class ScannerAdapter(Adapter):
    task = "scanner"

    def predict(self, context: Any) -> Prediction:
        raise NotImplementedError("Gate 4: wrap a Liddar scanner idea as a Prediction.")

    def resolve_outcome(self, prediction: Prediction) -> Optional[Outcome]:
        raise NotImplementedError("Gate 4: resolve against realized move over the horizon.")
