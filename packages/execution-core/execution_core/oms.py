"""Order Management System: idempotency + lifecycle over any Broker.

The OMS is the authority on "have we already sent this?" A client_key maps to at
most one order for the life of the process, so a retried signal never
double-sends even before the broker's own idempotency kicks in.
"""

from __future__ import annotations

from typing import Optional

from .broker import Broker
from .domain import Order, OrderIntent


class OMS:
    def __init__(self, broker: Broker) -> None:
        self.broker = broker
        self._orders: dict[str, Order] = {}

    def place(self, intent: OrderIntent, client_key: str) -> Optional[Order]:
        """Place via the broker, deduped on client_key. A seen key short-circuits
        and never reaches the broker a second time."""
        if client_key in self._orders:
            return self._orders[client_key]
        self.broker.place_order(intent, client_key)
        order = self.broker.get_order(client_key)
        if order is not None:
            self._orders[client_key] = order
        return order

    def get(self, client_key: str) -> Optional[Order]:
        return self._orders.get(client_key)

    def open_orders(self) -> list[Order]:
        from .domain import OrderState
        live = {OrderState.NEW, OrderState.SENT, OrderState.PARTIAL}
        return [o for o in self._orders.values() if o.state in live]
