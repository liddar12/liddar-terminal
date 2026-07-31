"""H1: gas sets the price.

Claim: in a gas-marginal ISO, day-ahead LMP tracks
``implied_heat_rate * Henry_Hub``. Method: regress DA LMP on gas price over
gas-marginal hours (walk-forward); recover the implied heat rate (slope).

Acceptance (from the brief, Section 3): slope in a plausible band (~6..12) for
the majority of gas-marginal hours, reported with R^2 by ISO/zone. The
acceptance check is implemented here so "done" is unambiguous; the data fit is
deferred until EIA_API_KEY + the ISO path are live.
"""

from __future__ import annotations

from dataclasses import dataclass

# Plausible implied-heat-rate band for a gas-marginal region (Btu/Wh-ish units).
HEAT_RATE_BAND = (6.0, 12.0)


@dataclass(frozen=True)
class H1Result:
    iso: str
    slope: float          # implied heat rate
    r_squared: float
    n: int                # gas-marginal hours in the fold/sample

    def passes(self) -> bool:
        """Acceptance: slope inside the plausible band. Fully defined now."""
        lo, hi = HEAT_RATE_BAND
        return lo <= self.slope <= hi


def run_h1(iso: str, start: str, end: str) -> list[H1Result]:
    """Walk-forward H1 over [start, end] for one ISO.

    Wiring: pull gas (EiaClient) + DA LMP (IsoClient), align on gas-marginal
    hours, split with walkforward.rolling_splits, fit LMP ~ gas per fold, emit an
    H1Result per fold, and log each fold's forward prediction to selflearn-core
    via PowerBacktestAdapter at Level 0.
    """
    raise NotImplementedError(
        "Gate 2: needs EIA_API_KEY + live ISO data. Splitter and acceptance "
        "check (H1Result.passes) are implemented; only the data fit is pending."
    )
