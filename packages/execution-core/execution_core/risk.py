"""Pre-trade risk gate. Pure function, no I/O, exhaustively testable.

The ONLY path from a signal to a broker runs through check(). It returns a pass
or one specific rejection reason. No check may be skipped; there is no bypass.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .domain import Balances, OrderIntent, Position, Quote, Side


@dataclass(frozen=True)
class Limits:
    max_position_notional: float
    max_gross_notional: float
    daily_loss_cap: float                      # positive number; session halts at -cap
    symbol_allowlist: Optional[frozenset] = None  # None = allow any


@dataclass(frozen=True)
class AccountState:
    positions: list[Position]
    balances: Balances
    day_realized_pnl: float = 0.0


@dataclass(frozen=True)
class GateResult:
    ok: bool
    reason: Optional[str] = None


def _fill_price(intent: OrderIntent, q: Quote) -> float:
    return q.ask if intent.side == Side.BUY else q.bid


def check(
    intent: OrderIntent,
    quote: Optional[Quote],
    state: AccountState,
    limits: Limits,
    client_key: str,
    wash_sale: bool = False,
) -> GateResult:
    """All checks must pass. First failure returns its reason."""
    if not client_key:
        return GateResult(False, "missing idempotency key")
    if intent.qty <= 0:
        return GateResult(False, "non-positive quantity")
    if limits.symbol_allowlist is not None and intent.symbol not in limits.symbol_allowlist:
        return GateResult(False, f"symbol not in allowlist: {intent.symbol}")
    if wash_sale:
        return GateResult(False, "wash-sale: order would void a harvested loss")
    if quote is None:
        return GateResult(False, "no quote available")
    if state.day_realized_pnl <= -limits.daily_loss_cap:
        return GateResult(False, "daily loss cap hit; session halted")

    notional = intent.qty * _fill_price(intent, quote)
    if notional > limits.max_position_notional:
        return GateResult(False, "position size cap exceeded")
    if intent.side == Side.BUY and notional > state.balances.buying_power:
        return GateResult(False, "insufficient buying power")

    gross = sum(abs(p.qty) * p.avg_price for p in state.positions) + notional
    if gross > limits.max_gross_notional:
        return GateResult(False, "gross exposure cap exceeded")

    return GateResult(True, None)
