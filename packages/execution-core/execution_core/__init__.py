"""execution-core: broker-agnostic execution — one Broker port, many adapters.

SimBroker (working), plus Schwab/Alpaca/Robinhood adapter stubs. A pure,
exhaustively-testable risk gate and an idempotent OMS sit in front of every
broker. No self-learning logic lives here; the engine wires this to the spine.
"""

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
    TimeInForce,
)
from .oms import OMS
from .risk import AccountState, GateResult, Limits, check
from .sim_broker import SimBroker

__all__ = [
    "Broker", "SimBroker", "OMS",
    "OrderIntent", "Order", "OrderAck", "OrderState", "OrderType",
    "Side", "TimeInForce", "Quote", "Position", "Balances", "BrokerCapabilities",
    "check", "Limits", "AccountState", "GateResult",
]
__version__ = "0.0.1"
