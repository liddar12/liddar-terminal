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
from .pit_source import (
    EiaSeriesSource,
    FredSeriesSource,
    InMemoryPitSource,
    Observation,
    PitSeriesSource,
    Release,
)
from .price_action import PriceActionPack, compute_price_action_features
from .macro_policy import MacroPolicyPack
from .commodities import CommoditiesPack
from .families import ALL_PACKS, AiInfraPack, GeopoliticsPack

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
    "Release",
    "Observation",
    "PitSeriesSource",
    "InMemoryPitSource",
    "FredSeriesSource",
    "EiaSeriesSource",
    "PriceActionPack",
    "compute_price_action_features",
    "MacroPolicyPack",
    "CommoditiesPack",
    "GeopoliticsPack",
    "AiInfraPack",
    "ALL_PACKS",
]
