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
from .families import (
    AiInfraPack,
    ALL_PACKS,
    CommoditiesPack,
    GeopoliticsPack,
    MacroPolicyPack,
    PriceActionPack,
)

__all__ = [
    "FeatureFamily",
    "FeaturePack",
    "FeatureSnapshot",
    "assemble_features",
    "validate_no_lookahead",
    "PriceActionPack",
    "MacroPolicyPack",
    "GeopoliticsPack",
    "CommoditiesPack",
    "AiInfraPack",
    "ALL_PACKS",
]
