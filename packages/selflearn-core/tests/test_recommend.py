"""Risk-tiered recommendation tests. Pure, no network."""

from selflearn_core.recommend import (
    BacktestView,
    ForwardView,
    RiskTier,
    build_recommendations,
)


def _views():
    bt = BacktestView(hit_rate=0.58, net_pnl_per_idea=34.0, n=47, max_drawdown=-0.12, window="1m")
    fwd = ForwardView(horizon="5d", expected_return=0.021, low=-0.03, high=0.08)
    return bt, fwd


def test_confidence_gates_tiers():
    bt, fwd = _views()
    # 0.60 clears MEDIUM(0.55) and HIGH(0.50) but not LOW(0.62)
    recs = build_recommendations("AI Calls", "AAPL", bt, fwd, live_confidence=0.60)
    assert [r.tier for r in recs] == [RiskTier.MEDIUM, RiskTier.HIGH]


def test_high_confidence_offers_all_three_lowest_first():
    bt, fwd = _views()
    recs = build_recommendations("AI Calls", "AAPL", bt, fwd, live_confidence=0.70)
    assert [r.tier for r in recs] == [RiskTier.LOW, RiskTier.MEDIUM, RiskTier.HIGH]


def test_low_confidence_offers_nothing_risky():
    bt, fwd = _views()
    recs = build_recommendations("AI Puts", "TSLA", bt, fwd, live_confidence=0.40)
    assert recs == []


def test_size_grows_with_tier_and_lenses_carry_through():
    bt, fwd = _views()
    recs = build_recommendations("AI Calls", "AAPL", bt, fwd, live_confidence=0.70)
    sizes = [r.size_frac for r in recs]
    assert sizes == sorted(sizes) and sizes[0] < sizes[-1]      # low < high
    for r in recs:
        assert r.backtest.n == 47 and r.forward.horizon == "5d"  # three lenses intact
        assert r.live_confidence == 0.70
