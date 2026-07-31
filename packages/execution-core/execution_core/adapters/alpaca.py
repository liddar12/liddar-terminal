"""Alpaca adapter (second target — proves the port is broker-agnostic).

Official developer API, equities + options, and a real paper endpoint (unlike
Schwab). Interface only; unlocks after Schwab. VERIFY endpoints/schema/limits.
"""

from __future__ import annotations

from typing import Optional

from ..broker import Broker
from ..domain import Balances, BrokerCapabilities, Order, OrderAck, OrderIntent, Position


class AlpacaBroker(Broker):
    def capabilities(self) -> BrokerCapabilities:
        return BrokerCapabilities(
            name="alpaca", official_api=True, options=True, streaming=True,
            fractional=True, notes="official API + real paper endpoint (VERIFY)",
        )

    def get_positions(self) -> list[Position]:
        raise NotImplementedError("Adapter: implement after Schwab proves the port.")

    def get_balances(self) -> Balances:
        raise NotImplementedError("Adapter: implement after Schwab proves the port.")

    def place_order(self, intent: OrderIntent, client_key: str) -> OrderAck:
        raise NotImplementedError("Adapter: implement after Schwab proves the port.")

    def cancel(self, broker_order_id: str) -> None:
        raise NotImplementedError("Adapter: implement after Schwab proves the port.")

    def get_order(self, client_key: str) -> Optional[Order]:
        raise NotImplementedError("Adapter: implement after Schwab proves the port.")
