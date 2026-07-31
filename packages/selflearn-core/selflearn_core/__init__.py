"""selflearn-core: log predictions, resolve outcomes, score, feed back.

Gate 1 scaffold: types are implemented; store/scoring/registry/updater/adapters
expose stable interfaces whose bodies unlock at the gate named in each docstring.
No modeling and no live orders exist yet, by design.
"""

from .types import Outcome, Prediction, ResolvedPrediction, Score

__all__ = ["Prediction", "Outcome", "ResolvedPrediction", "Score"]
__version__ = "0.0.1"
