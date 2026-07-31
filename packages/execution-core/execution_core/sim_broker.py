"""SimBroker: fills orders against supplied quotes. The 'paper' path.

Since no broker offers an official paper sandbox we simulate here: market orders
fill immediately at the touch (ask for buys, bid for sells) plus a slippage
allowance. Idempotent on client_key. Deterministic, no network — the backbone of
every backtest and the Gate 6 simulated-execution gate.
"""

from __future__ import annotations

from typing import Optional

from .broker import Broker
from .domain import (
    Balances,
    BrokerCapabilities,
    Order,
    OrderAck,
    OrderIntent,
    OrderState,
    OrderType,
    Position,
    Quote,
    Side,
)


class SimBroker(Broker):
    def __init__(self, cash: float = 100_000.0, slippage_bps: float = 1.0) -> None:
        self._cash = cash
        self._slip = slippage_bps / 10_000.0
        self._quotes: dict[str, Quote] = {}
        self._positions: dict[str, Position] = {}
        self._orders: dict[str, Order] = {}   # client_key -> Order
        self._seq = 0

    # test/feed helper
    def set_quote(self, q: Quote) -> None:
        self._quotes[q.symbol] = q

    def capabilities(self) -> BrokerCapabilities:
        return BrokerCapabilities(
            name="sim", official_api=True, options=True, streaming=True,
            fractional=True, notes="local fills vs supplied quotes",
        )

    def get_positions(self) -> list[Position]:
        return [p for p in self._positions.values() if p.qty != 0]

    def get_balances(self) -> Balances:
        equity = self._cash + sum(
            p.qty * self._mark(p.symbol) for p in self._positions.values()
        )
        return Balances(cash=self._cash, equity=equity, buying_power=self._cash)

    def get_order(self, client_key: str) -> Optional[Order]:
        return self._orders.get(client_key)

    def cancel(self, broker_order_id: str) -> None:
        for o in self._orders.values():
            if o.broker_order_id == broker_order_id and o.state in (OrderState.NEW, OrderState.SENT):
                o.state = OrderState.CANCELLED

    def place_order(self, intent: OrderIntent, client_key: str) -> OrderAck:
        # Idempotency: a repeat of the same client_key returns the first result.
        if client_key in self._orders:
            o = self._orders[client_key]
            return OrderAck(client_key, o.broker_order_id, o.state)

        self._seq += 1
        oid = f"sim-{self._seq}"
        q = self._quotes.get(intent.symbol)
        order = Order(client_key=client_key, broker_order_id=oid, intent=intent, state=OrderState.SENT)
        self._orders[client_key] = order

        if q is None:
            order.state = OrderState.REJECTED
            return OrderAck(client_key, oid, order.state)

        price = self._fill_price(intent, q)
        if intent.order_type == OrderType.LIMIT and not self._limit_ok(intent, price):
            return OrderAck(client_key, oid, order.state)  # stays SENT (unmarketable)

        self._apply_fill(intent, price)
        order.state = OrderState.FILLED
        order.filled_qty = intent.qty
        order.avg_fill_price = price
        return OrderAck(client_key, oid, order.state)

    # --- internals ---
    def _mark(self, symbol: str) -> float:
        q = self._quotes.get(symbol)
        return (q.bid + q.ask) / 2 if q else 0.0

    def _fill_price(self, intent: OrderIntent, q: Quote) -> float:
        if intent.side == Side.BUY:
            return q.ask * (1 + self._slip)
        return q.bid * (1 - self._slip)

    def _limit_ok(self, intent: OrderIntent, price: float) -> bool:
        if intent.limit_price is None:
            return True
        return price <= intent.limit_price if intent.side == Side.BUY else price >= intent.limit_price

    def _apply_fill(self, intent: OrderIntent, price: float) -> None:
        signed = intent.qty if intent.side == Side.BUY else -intent.qty
        self._cash -= signed * price
        pos = self._positions.get(intent.symbol, Position(intent.symbol, 0.0, 0.0))
        new_qty = pos.qty + signed
        if pos.qty == 0 or (pos.qty > 0) == (signed > 0):
            # opening or adding: weighted-average cost
            total = pos.qty * pos.avg_price + signed * price
            avg = total / new_qty if new_qty != 0 else 0.0
        else:
            avg = pos.avg_price if new_qty != 0 else 0.0  # reducing keeps basis
        self._positions[intent.symbol] = Position(intent.symbol, new_qty, avg)
