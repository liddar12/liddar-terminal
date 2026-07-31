"""execution-core tests. Pure/stdlib, no network."""

import pytest

from execution_core import (
    AccountState,
    Balances,
    Limits,
    OMS,
    OrderIntent,
    OrderState,
    OrderType,
    Position,
    Quote,
    Side,
    SimBroker,
    check,
)
from execution_core.adapters import AlpacaBroker, RobinhoodBroker, SchwabBroker


def _quote(sym="AAPL", bid=99.0, ask=101.0):
    return Quote(sym, bid, ask, ts=0)


# --- SimBroker ---------------------------------------------------------------

def test_sim_buy_fills_and_updates_position():
    b = SimBroker(cash=100_000)
    b.set_quote(_quote())
    ack = b.place_order(OrderIntent("AAPL", Side.BUY, 10), "k1")
    assert ack.state == OrderState.FILLED
    pos = {p.symbol: p for p in b.get_positions()}["AAPL"]
    assert pos.qty == 10
    assert b.get_balances().cash < 100_000            # paid out


def test_sim_is_idempotent_on_client_key():
    b = SimBroker(cash=100_000)
    b.set_quote(_quote())
    b.place_order(OrderIntent("AAPL", Side.BUY, 10), "same")
    b.place_order(OrderIntent("AAPL", Side.BUY, 10), "same")   # retry
    assert {p.symbol: p for p in b.get_positions()}["AAPL"].qty == 10  # not 20


def test_sim_unmarketable_limit_does_not_fill():
    b = SimBroker(cash=100_000)
    b.set_quote(_quote())
    ack = b.place_order(
        OrderIntent("AAPL", Side.BUY, 10, OrderType.LIMIT, limit_price=50.0), "k2"
    )
    assert ack.state == OrderState.SENT
    assert b.get_positions() == []


# --- risk gate ---------------------------------------------------------------

def _state(cash=100_000, positions=None, pnl=0.0):
    bal = Balances(cash=cash, equity=cash, buying_power=cash)
    return AccountState(positions or [], bal, pnl)


def _limits(allow=None):
    return Limits(
        max_position_notional=5_000, max_gross_notional=20_000,
        daily_loss_cap=1_000, symbol_allowlist=allow,
    )


@pytest.mark.parametrize("mutate,expect", [
    ("ok", True),
    ("no_key", False),
    ("bad_qty", False),
    ("not_allowed", False),
    ("wash", False),
    ("too_big", False),
    ("no_bp", False),
    ("loss_cap", False),
])
def test_risk_gate_table(mutate, expect):
    intent = OrderIntent("AAPL", Side.BUY, 10)     # 10 * 101 = 1010 notional
    q = _quote()
    state = _state()
    limits = _limits()
    key = "k"
    wash = False
    if mutate == "no_key":
        key = ""
    elif mutate == "bad_qty":
        intent = OrderIntent("AAPL", Side.BUY, 0)
    elif mutate == "not_allowed":
        limits = _limits(allow=frozenset({"MSFT"}))
    elif mutate == "wash":
        wash = True
    elif mutate == "too_big":
        intent = OrderIntent("AAPL", Side.BUY, 100)    # 10100 > 5000 cap
    elif mutate == "no_bp":
        state = _state(cash=500)                        # 1010 > 500 buying power
    elif mutate == "loss_cap":
        state = _state(pnl=-1_000)                      # at the cap
    res = check(intent, q, state, limits, key, wash_sale=wash)
    assert res.ok is expect
    if not expect:
        assert res.reason                               # every rejection is explained


def test_risk_gate_gross_exposure():
    intent = OrderIntent("AAPL", Side.BUY, 10)          # +1010
    held = [Position("MSFT", 200, 100.0)]               # 20000 gross already
    res = check(intent, _quote(), _state(positions=held), _limits(), "k")
    assert res.ok is False and "gross" in res.reason


# --- OMS ---------------------------------------------------------------------

def test_oms_dedups_and_never_double_sends():
    calls = {"n": 0}
    b = SimBroker(cash=100_000); b.set_quote(_quote())
    orig = b.place_order
    def counting(intent, key):
        calls["n"] += 1
        return orig(intent, key)
    b.place_order = counting
    oms = OMS(b)
    o1 = oms.place(OrderIntent("AAPL", Side.BUY, 5), "dup")
    o2 = oms.place(OrderIntent("AAPL", Side.BUY, 5), "dup")   # retry
    assert o1 is o2
    assert calls["n"] == 1                              # broker hit exactly once


# --- broker-agnostic ---------------------------------------------------------

def test_all_adapters_share_the_port_and_flag_official_api():
    caps = {c.name: c for c in (
        SchwabBroker().capabilities(),
        AlpacaBroker().capabilities(),
        RobinhoodBroker().capabilities(),
    )}
    assert caps["schwab"].official_api is True
    assert caps["alpaca"].official_api is True
    assert caps["robinhood"].official_api is False      # loudly unofficial
