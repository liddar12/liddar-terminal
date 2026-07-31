"""Feature layer: the wide signal universe → point-in-time, no-lookahead inputs.

Taxonomy, snapshot record, no-lookahead validator, and assembler are real at
Gate 1. Concrete packs (``families.py``) unlock their data wiring at later gates.
"""

from .base import (
    FeatureFamily,
    FeaturePack,
    FeatureSnapshot,
    assemble_features,
    validate_no_lookahead,
)
from .bars import Bar, BarSource, InMemoryBarSource, SchwabBarSource
from .price_action import PriceActionPack, compute_price_action_features
from .families import (
    AiInfraPack,
    ALL_PACKS,
    CommoditiesPack,
    GeopoliticsPack,
    MacroPolicyPack,
)

__all__ = [
    "FeatureFamily",
    "FeaturePack",
    "FeatureSnapshot",
    "assemble_features",
    "validate_no_lookahead",
    "Bar",
    "BarSource",
    "InMemoryBarSource",
    "SchwabBarSource",
    "PriceActionPack",
    "compute_price_action_features",
    "MacroPolicyPack",
    "GeopoliticsPack",
    "CommoditiesPack",
    "AiInfraPack",
    "ALL_PACKS",
]
