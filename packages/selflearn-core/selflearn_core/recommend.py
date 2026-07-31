"""Risk-tiered recommendations.

A recommendation keeps three lenses strictly separate so we never sell a
projection as a fact:

- **backtest** (BacktestView): what actually happened, out-of-sample /
  walk-forward. History, not a promise.
- **forward** (ForwardView): an explicit projection for the horizon, with an
  interval. Clearly labelled as an estimate, never mixed into the backtest.
- **live_confidence**: the self-learning layer's current calibrated confidence,
  which moves as new outcomes resolve and decides which risk tiers qualify.

The self-learning layer emits Low / Medium / High versions of a signal. The tier
changes size, eligibility, and how the idea is expressed (defined-risk vs
directional); it does not change the underlying signal. Tier policy limits feed
the pre-trade risk gate; the gate still has the final say.

The default tier numbers are starting points to be calibrated from live results,
not fixed truth (VERIFY against realized performance before real capital).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class RiskTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class BacktestView:
    """Realized, out-of-sample performance. What happened."""

    hit_rate: float
    net_pnl_per_idea: float
    n: int
    max_drawdown: Optional[float] = None
    window: str = "all"


@dataclass(frozen=True)
class ForwardView:
    """A projection for the horizon. Explicitly an estimate, not the backtest."""

    horizon: str
    expected_return: float  # fractional, e.g. 0.03 = +3%
    low: float              # interval bound
    high: float             # interval bound
    basis: str = "model"    # how the estimate was formed


@dataclass(frozen=True)
class TierPolicy:
    """How a tier constrains sizing and eligibility. Feeds the risk gate."""

    tier: RiskTier
    max_position_frac: float       # cap per position, fraction of account
    max_gross_exposure_frac: float # cap on total exposure for the tier
    min_live_confidence: float     # tier is offered only at/above this confidence
    instruments: tuple[str, ...]   # allowed expressions of the idea


@dataclass(frozen=True)
class Recommendation:
    signal: str
    cohort: str
    tier: RiskTier
    backtest: BacktestView       # backtested AI
    forward: ForwardView         # future estimate
    live_confidence: float       # self-learning AI (calibrated)
    size_frac: float             # tier cap applied
    instruments: tuple[str, ...]
    rationale: str = ""
    meta: dict = field(default_factory=dict)


# Starting defaults. Calibrate from live results; do not treat as fixed.
DEFAULT_TIER_POLICIES: dict[RiskTier, TierPolicy] = {
    RiskTier.LOW: TierPolicy(
        RiskTier.LOW, max_position_frac=0.02, max_gross_exposure_frac=0.20,
        min_live_confidence=0.62, instruments=("defined_risk_spread", "cash_secured"),
    ),
    RiskTier.MEDIUM: TierPolicy(
        RiskTier.MEDIUM, max_position_frac=0.05, max_gross_exposure_frac=0.50,
        min_live_confidence=0.55, instruments=("long_option", "vertical_spread"),
    ),
    RiskTier.HIGH: TierPolicy(
        RiskTier.HIGH, max_position_frac=0.10, max_gross_exposure_frac=0.90,
        min_live_confidence=0.50, instruments=("long_option", "directional"),
    ),
}


def build_recommendations(
    signal: str,
    cohort: str,
    backtest: BacktestView,
    forward: ForwardView,
    live_confidence: float,
    policies: dict[RiskTier, TierPolicy] = DEFAULT_TIER_POLICIES,
) -> list[Recommendation]:
    """Emit Low/Med/High recommendations for a signal.

    A tier is offered only when live (self-learning) confidence clears that
    tier's floor, so a shaky signal simply won't produce a High-risk version.
    Returned lowest-risk first. Size is the tier cap; the risk gate constrains
    further at order time.
    """
    out: list[Recommendation] = []
    for tier in (RiskTier.LOW, RiskTier.MEDIUM, RiskTier.HIGH):
        p = policies[tier]
        if live_confidence < p.min_live_confidence:
            continue
        out.append(
            Recommendation(
                signal=signal, cohort=cohort, tier=tier,
                backtest=backtest, forward=forward, live_confidence=live_confidence,
                size_frac=p.max_position_frac, instruments=p.instruments,
                rationale=(
                    f"{tier.value}: conf {live_confidence:.2f} >= floor "
                    f"{p.min_live_confidence:.2f}; size <= {p.max_position_frac:.0%} / position"
                ),
            )
        )
    return out
