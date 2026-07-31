"""Robinhood adapter — SUPPORTED BY THE PORT, NOT RECOMMENDED FOR REAL MONEY.

Robinhood has no official stock/options trading API. Any adapter here is a
reverse-engineered client that: violates Robinhood's ToS, has no stability
guarantee (auth/endpoints change without notice), and risks account lockout.
The port can host it, but do not route real capital through it. Kept as a stub
to prove the abstraction is genuinely broker-agnostic, with a loud capability flag.
"""

from __future__ import annotations

from typing import Optional

from ..broker import Broker
from ..domain import Balances, BrokerCapabilities, Order, OrderAck, OrderIntent, Position


class RobinhoodBroker(Broker):
    def capabilities(self) -> BrokerCapabilities:
        return BrokerCapabilities(
            name="robinhood", official_api=False, options=True, streaming=False,
            fractional=True,
            notes="UNOFFICIAL reverse-engineered API. ToS risk, unstable, account-lock risk.",
        )

    def get_positions(self) -> list[Position]:
        raise NotImplementedError("Unofficial API — not implemented. See module docstring.")

    def get_balances(self) -> Balances:
        raise NotImplementedError("Unofficial API — not implemented. See module docstring.")

    def place_order(self, intent: OrderIntent, client_key: str) -> OrderAck:
        raise NotImplementedError("Unofficial API — not implemented. See module docstring.")

    def cancel(self, broker_order_id: str) -> None:
        raise NotImplementedError("Unofficial API — not implemented. See module docstring.")

    def get_order(self, client_key: str) -> Optional[Order]:
        raise NotImplementedError("Unofficial API — not implemented. See module docstring.")
