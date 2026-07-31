"""Schwab adapter (first live target). OAuth + REST + WebSocket.

Interface only; bodies unlock at Gate 5 (read-only) → 6 (sim) → 7 (live). Every
endpoint, the order schema, rate limits, streaming coverage, and lot/cost-basis
support are VERIFY against Schwab's current developer docs before wiring. There
is no official paper sandbox; use SimBroker for 'paper'.
"""

from __future__ import annotations

from typing import Optional

from ..broker import Broker
from ..domain import Balances, BrokerCapabilities, Order, OrderAck, OrderIntent, Position


class SchwabBroker(Broker):
    def capabilities(self) -> BrokerCapabilities:
        return BrokerCapabilities(
            name="schwab", official_api=True, options=True, streaming=True,
            fractional=False, notes="retail REST+WS, OAuth; no paper sandbox (VERIFY)",
        )

    def get_positions(self) -> list[Position]:
        raise NotImplementedError("Gate 5: Schwab positions read.")

    def get_balances(self) -> Balances:
        raise NotImplementedError("Gate 5: Schwab balances read.")

    def place_order(self, intent: OrderIntent, client_key: str) -> OrderAck:
        raise NotImplementedError("Gate 7: Schwab order placement (idempotent on client_key).")

    def cancel(self, broker_order_id: str) -> None:
        raise NotImplementedError("Gate 7: Schwab cancel.")

    def get_order(self, client_key: str) -> Optional[Order]:
        raise NotImplementedError("Gate 5: Schwab order read.")
