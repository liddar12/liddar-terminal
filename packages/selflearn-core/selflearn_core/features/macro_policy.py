"""MacroPolicyPack: rates, curve, and prints → point-in-time features.

Symbol-agnostic (the same macro state applies to every name on a date). Every
feature's ``obs_ts`` is the release time of the series it came from, so a print
can never enter a prediction before it was published, and revisions are handled
by the vintage source. Series ids are indirected through ``SERIES`` so the live
FRED ids get confirmed (VERIFY) in one place, not scattered.
"""

from __future__ import annotations

from .base import FeatureFamily, FeaturePack, FeatureSnapshot
from .pit_source import PitSeriesSource

# Logical series → provider id. [VERIFY] the FRED ids before wiring the live source.
SERIES = {
    "fed_funds": "DFEDTARU",   # fed funds target, upper
    "y2": "DGS2",              # 2y Treasury
    "y10": "DGS10",            # 10y Treasury
    "real_10": "DFII10",       # 10y TIPS (real yield)
    "cpi_yoy": "CPIYOY",       # CPI YoY print (carries consensus for surprise)
    "dxy": "DTWEXBGS",         # broad USD index (proxy)
}


class MacroPolicyPack(FeaturePack):
    family = FeatureFamily.MACRO_POLICY
    name = "macro_policy"

    def __init__(self, source: PitSeriesSource, series: dict[str, str] | None = None) -> None:
        self.source = source
        self.series = series or SERIES

    def snapshot(self, symbol: str, as_of_ts: int) -> FeatureSnapshot:
        values: dict[str, float] = {}
        obs_ts: dict[str, int] = {}

        def put(key: str, value: float, when: int) -> None:
            values[key] = value
            obs_ts[key] = when

        ff = self.source.observe(self.series["fed_funds"], as_of_ts)
        if ff is not None:
            put("fed_funds", ff.value, ff.obs_ts)

        y2 = self.source.observe(self.series["y2"], as_of_ts)
        y10 = self.source.observe(self.series["y10"], as_of_ts)
        if y2 is not None and y10 is not None:
            # the slope is known only once BOTH legs have been observed
            put("curve_2s10s", y10.value - y2.value, max(y2.obs_ts, y10.obs_ts))
        if y10 is not None:
            put("y10", y10.value, y10.obs_ts)

        real = self.source.observe(self.series["real_10"], as_of_ts)
        if real is not None:
            put("real_yield_10", real.value, real.obs_ts)

        cpi = self.source.observe(self.series["cpi_yoy"], as_of_ts)
        if cpi is not None:
            put("cpi_yoy", cpi.value, cpi.obs_ts)
            if cpi.surprise is not None:
                put("cpi_surprise", cpi.surprise, cpi.obs_ts)

        dxy = self.source.observe(self.series["dxy"], as_of_ts)
        if dxy is not None:
            put("dxy", dxy.value, dxy.obs_ts)

        return FeatureSnapshot(
            pack=self.name, family=self.family, as_of_ts=as_of_ts,
            values=values, obs_ts=obs_ts,
        )
