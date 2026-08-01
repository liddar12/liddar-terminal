"""Concrete feature packs, one per family.

Signatures and family tags are fixed at Gate 1. Bodies raise
``NotImplementedError`` naming the gate that unlocks the data wiring, so nothing
is a silent stub. Each pack must obey no-lookahead: only observations with
``obs_ts <= as_of_ts`` may enter the snapshot.
"""

from __future__ import annotations

from .base import FeaturePack, FeatureFamily, FeatureSnapshot
from .price_action import PriceActionPack   # wired at Gate 2
from .macro_policy import MacroPolicyPack    # wired: rates/curve/prints, vintage-aware
from .commodities import CommoditiesPack     # wired: sector-linked curves + balances


class GeopoliticsPack(FeaturePack):
    """Wars, regional conflict, sanctions, shipping-lane / chokepoint risk. Encoded
    as dated risk indices/event flags; the scorer decides if they carry edge."""

    family = FeatureFamily.GEOPOLITICS
    name = "geopolitics"

    def snapshot(self, symbol: str, as_of_ts: int) -> FeatureSnapshot:
        raise NotImplementedError(
            "Gate 3+ (feature expansion): geopolitical risk/event features, dated to source."
        )


class AiInfraPack(FeaturePack):
    """AI buildout, data centers, power, water, chips — the Power 2026 surface.
    Feeds from the Workstream A research (EIA/ISO/gridstatus) once it produces
    tradable, point-in-time signals."""

    family = FeatureFamily.AI_INFRA
    name = "ai_infra"

    def snapshot(self, symbol: str, as_of_ts: int) -> FeatureSnapshot:
        raise NotImplementedError(
            "Gate 3+ (feature expansion): AI/data-center/power/water/chip features "
            "from Workstream A outputs."
        )


ALL_PACKS = (
    PriceActionPack,
    MacroPolicyPack,
    GeopoliticsPack,
    CommoditiesPack,
    AiInfraPack,
)
