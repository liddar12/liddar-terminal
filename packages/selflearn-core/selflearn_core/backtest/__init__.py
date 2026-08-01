"""Walk-forward backtest harness for price-action signals.

Real, tested machinery: run a signal over history with no lookahead, resolve
each call against the realized forward move, and score hit-rate + mean return by
cohort with confidence intervals. Data-source-agnostic — it consumes any
``BarSource``, so real bars drop in the moment a feed exists.
"""

from .score import score_resolved, wilson_ci
from .signals import trend_signal
from .walkforward import Signal, run_walkforward

__all__ = ["run_walkforward", "Signal", "trend_signal", "score_resolved", "wilson_ci"]
