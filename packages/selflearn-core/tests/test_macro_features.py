"""Gate 3 tests for the macro layer: the point-in-time source honors vintages
(the make-or-break rule), macro_policy computes rates/curve/surprise with correct
release stamps, and commodities is sector-linked and term-structure-correct.
"""

import pytest

from selflearn_core.features import (
    CommoditiesPack,
    FeatureFamily,
    InMemoryPitSource,
    MacroPolicyPack,
    assemble_features,
    validate_no_lookahead,
)


# ---- point-in-time source -------------------------------------------------

def test_observe_returns_release_in_effect_not_the_future():
    src = InMemoryPitSource()
    # June CPI first printed 2.9 on Jul 15, revised to 3.1 on Aug 20
    src.add_release("CPIYOY", release_ts=1500, value=2.9, ref_ts=1000, consensus=3.0)
    src.add_release("CPIYOY", release_ts=2500, value=3.1, ref_ts=1000)

    early = src.observe("CPIYOY", as_of_ts=2000)  # only the first print exists yet
    assert early.value == 2.9
    assert early.obs_ts == 1500
    assert early.surprise == pytest.approx(2.9 - 3.0)  # actual − consensus

    later = src.observe("CPIYOY", as_of_ts=3000)  # revision now visible
    assert later.value == 3.1
    assert later.obs_ts == 2500


def test_observe_is_none_before_first_release():
    src = InMemoryPitSource()
    src.add_release("DGS10", release_ts=5000, value=4.2)
    assert src.observe("DGS10", as_of_ts=4000) is None
    assert src.observe("MISSING", as_of_ts=9000) is None


# ---- macro_policy ---------------------------------------------------------

def _macro_source():
    src = InMemoryPitSource()
    src.add_release("DFEDTARU", 900, 5.50)
    src.add_release("DGS2", 1000, 4.80)
    src.add_release("DGS10", 1000, 4.20)
    src.add_release("DFII10", 1000, 1.90)
    src.add_release("CPIYOY", 1200, 3.2, consensus=3.0)
    src.add_release("DTWEXBGS", 1000, 121.0)
    return src


def test_macro_policy_computes_curve_and_surprise():
    pack = MacroPolicyPack(_macro_source())
    snap = pack.snapshot("ANY", as_of_ts=2000)
    v = snap.values
    assert v["fed_funds"] == 5.50
    assert v["curve_2s10s"] == pytest.approx(4.20 - 4.80)   # inverted
    assert v["real_yield_10"] == 1.90
    assert v["cpi_surprise"] == pytest.approx(3.2 - 3.0)
    # the curve is only knowable once both legs are in — stamped to the later leg
    assert snap.obs_ts["curve_2s10s"] == 1000
    assert snap.obs_ts["cpi_surprise"] == 1200
    validate_no_lookahead(snap)


def test_macro_policy_excludes_prints_not_yet_released():
    pack = MacroPolicyPack(_macro_source())
    snap = pack.snapshot("ANY", as_of_ts=1100)  # before CPI's 1200 release
    assert "cpi_surprise" not in snap.values
    assert "fed_funds" in snap.values
    validate_no_lookahead(snap)


# ---- commodities (sector-linked) ------------------------------------------

def _commodity_source():
    src = InMemoryPitSource()
    src.add_release("CL_M1", 1000, 80.0)   # WTI front
    src.add_release("CL_M2", 1000, 78.0)   # WTI back (backwardated)
    src.add_release("WCESTUS1", 1000, 420.0, consensus=425.0)  # crude storage
    src.add_release("GC_M1", 1000, 2400.0)  # gold front
    src.add_release("GC_M2", 1000, 2412.0)  # gold back (contango)
    return src


def test_commodities_attaches_oil_curve_to_an_oil_name():
    pack = CommoditiesPack(_commodity_source())
    snap = pack.snapshot("XOM", as_of_ts=2000)
    v = snap.values
    assert v["oil_front"] == 80.0
    assert v["oil_front_back_spread"] == pytest.approx(2.0)
    assert v["oil_backwardation"] == 1.0                  # front > back
    assert v["oil_roll_yield"] == pytest.approx(2.0 / 80.0)
    assert v["oil_storage_surprise"] == pytest.approx(420.0 - 425.0)  # draw vs expected
    validate_no_lookahead(snap)


def test_commodities_marks_gold_contango():
    snap = CommoditiesPack(_commodity_source()).snapshot("GLD", as_of_ts=2000)
    assert snap.values["gold_backwardation"] == 0.0       # front < back
    assert snap.values["gold_roll_yield"] < 0


def test_commodities_gives_a_bank_nothing():
    snap = CommoditiesPack(_commodity_source()).snapshot("BAC", as_of_ts=2000)
    assert snap.values == {}                               # not commodity-linked, by design


def test_macro_and_commodity_snapshots_assemble_namespaced():
    macro = MacroPolicyPack(_macro_source()).snapshot("XOM", 2000)
    cmdty = CommoditiesPack(_commodity_source()).snapshot("XOM", 2000)
    feats = assemble_features([macro, cmdty], as_of_ts=2000)
    assert "macro_policy.macro_policy.curve_2s10s" in feats
    assert "commodities.commodities.oil_front" in feats
    assert macro.family is FeatureFamily.MACRO_POLICY
