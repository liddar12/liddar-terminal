"""CommoditiesPack: metal/energy levels, term structure, and balances.

Sector-linked — the oil curve attaches to XOM/REI, natgas to EQT/GPOR, gold to
GLD/SGOL, and a bank or a bond gets nothing. That is exactly why the shared
``snapshot(symbol, as_of_ts)`` signature carries a symbol: this pack conditions on
it. Every feature is point-in-time via the vintage source.
"""

from __future__ import annotations

from .base import FeatureFamily, FeaturePack, FeatureSnapshot
from .pit_source import PitSeriesSource

# Which commodity each universe name trades on. Banks/bonds are absent by design.
COMMODITY_BY_SYMBOL = {
    "XOM": "oil", "REI": "oil",
    "EQT": "natgas", "GPOR": "natgas",
    "GLD": "gold", "SGOL": "gold",
}

# Logical series per commodity → provider id. [VERIFY] against EIA/exchange docs.
SERIES = {
    "oil":    {"front": "CL_M1", "back": "CL_M2", "storage": "WCESTUS1"},
    "natgas": {"front": "NG_M1", "back": "NG_M2", "storage": "NW2_EPG0_SWO_R48_BCF"},
    "gold":   {"front": "GC_M1", "back": "GC_M2"},
}


class CommoditiesPack(FeaturePack):
    family = FeatureFamily.COMMODITIES
    name = "commodities"

    def __init__(
        self,
        source: PitSeriesSource,
        symbol_map: dict[str, str] | None = None,
        series: dict[str, dict[str, str]] | None = None,
    ) -> None:
        self.source = source
        self.symbol_map = symbol_map or COMMODITY_BY_SYMBOL
        self.series = series or SERIES

    def snapshot(self, symbol: str, as_of_ts: int) -> FeatureSnapshot:
        values: dict[str, float] = {}
        obs_ts: dict[str, int] = {}
        commodity = self.symbol_map.get(symbol)
        if commodity is None:  # not a commodity-linked name → no features, by design
            return FeatureSnapshot(pack=self.name, family=self.family,
                                   as_of_ts=as_of_ts, values=values, obs_ts=obs_ts)

        ids = self.series[commodity]
        front = self.source.observe(ids["front"], as_of_ts)
        back = self.source.observe(ids["back"], as_of_ts)

        if front is not None:
            values[f"{commodity}_front"] = front.value
            obs_ts[f"{commodity}_front"] = front.obs_ts
        if front is not None and back is not None and front.value:
            when = max(front.obs_ts, back.obs_ts)
            spread = front.value - back.value
            values[f"{commodity}_front_back_spread"] = spread
            obs_ts[f"{commodity}_front_back_spread"] = when
            # backwardation (front > back) vs contango (front < back)
            values[f"{commodity}_backwardation"] = 1.0 if spread > 0 else 0.0
            obs_ts[f"{commodity}_backwardation"] = when
            values[f"{commodity}_roll_yield"] = spread / front.value
            obs_ts[f"{commodity}_roll_yield"] = when

        storage_id = ids.get("storage")
        if storage_id is not None:
            storage = self.source.observe(storage_id, as_of_ts)
            if storage is not None:
                values[f"{commodity}_storage"] = storage.value
                obs_ts[f"{commodity}_storage"] = storage.obs_ts
                if storage.surprise is not None:
                    values[f"{commodity}_storage_surprise"] = storage.surprise
                    obs_ts[f"{commodity}_storage_surprise"] = storage.obs_ts

        return FeatureSnapshot(pack=self.name, family=self.family,
                               as_of_ts=as_of_ts, values=values, obs_ts=obs_ts)
