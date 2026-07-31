"""The Broker port. One interface; many adapters (Sim, Schwab, Alpaca, ...).

Sim and live share this exact interface, so a strategy proven in simulation
runs against a real broker with no code change. Streaming is declared in
capabilities and added to adapters at their gate; the core order lifecycle is
request/response here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from .domain import Balances, BrokerCapabilities, OrderAck, OrderIntent, Order, Position


class Broker(ABC):
    @abstractmethod
    def capabilities(self) -> BrokerCapabilities:
        ...

    @abstractmethod
    def get_positions(self) -> list[Position]:
        ...

    @abstractmethod
    def get_balances(self) -> Balances:
        ...

    @abstractmethod
    def place_order(self, intent: OrderIntent, client_key: str) -> OrderAck:
        """Place an order. MUST be idempotent on client_key: the same key never
        produces a second live order."""

    @abstractmethod
    def cancel(self, broker_order_id: str) -> None:
        ...

    @abstractmethod
    def get_order(self, client_key: str) -> Optional[Order]:
        ...
