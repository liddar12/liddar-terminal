"""Broker-agnostic domain types.

Nothing here knows about Schwab, Alpaca, or any specific broker. Every broker
adapter maps its own API onto these types, so the OMS, risk gate, and the
self-learning spine never depend on a vendor.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class TimeInForce(str, Enum):
    DAY = "day"
    GTC = "gtc"


class OrderState(str, Enum):
    NEW = "new"            # created locally, not sent
    SENT = "sent"          # accepted by broker
    PARTIAL = "partial"    # partially filled
    FILLED = "filled"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class OrderIntent:
    symbol: str
    side: Side
    qty: float
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[float] = None
    tif: TimeInForce = TimeInForce.DAY
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Quote:
    symbol: str
    bid: float
    ask: float
    ts: int


@dataclass(frozen=True)
class Fill:
    order_id: str
    symbol: str
    side: Side
    qty: float
    price: float
    ts: int


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: float
    avg_price: float


@dataclass(frozen=True)
class Balances:
    cash: float
    equity: float
    buying_power: float


@dataclass(frozen=True)
class OrderAck:
    client_key: str
    broker_order_id: str
    state: OrderState


@dataclass
class Order:
    client_key: str
    broker_order_id: str
    intent: OrderIntent
    state: OrderState
    filled_qty: float = 0.0
    avg_fill_price: float = 0.0


@dataclass(frozen=True)
class BrokerCapabilities:
    name: str
    official_api: bool     # False = unofficial/reverse-engineered (ToS + stability risk)
    options: bool
    streaming: bool
    fractional: bool
    notes: str = ""
