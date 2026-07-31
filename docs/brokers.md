# Brokers: capability matrix + recommendation

The app is **broker-agnostic by construction**: one `Broker` port
(`execution_core.broker.Broker`), many adapters. Swapping brokers changes an
adapter, never the OMS, risk gate, or self-learning spine. All specifics below
are `VERIFY` against each provider's current docs before wiring.

## Matrix

| Broker | Official API | Options | Streaming | Paper sandbox | Recommendation |
|---|---|---|---|---|---|
| **Schwab** | Yes | Yes | Yes (WS) | **No** (sim locally) | **Build first** — your account |
| **Alpaca** | Yes | Yes | Yes | Yes (real paper) | **Second** — proves the port; great for testing |
| Interactive Brokers | Yes | Yes (deep) | Yes | Yes | Later — powerful but heavy (gateway/TWS) |
| Tradier | Yes | Yes | Yes | Yes | Later — simple REST, options-friendly |
| **Robinhood** | **No** | Yes | No | No | **Not recommended** — unofficial only |

## Why Schwab first, then Alpaca

- **Schwab** is your brokerage account, so it's the real target. Its API is a
  retail REST + WebSocket surface with OAuth and rate limits — not a colocated
  venue, and with **no official paper sandbox**, so "paper" = `SimBroker`
  filling against live quotes.
- **Alpaca** is the cleanest way to *prove* broker-agnosticism: official API,
  options support, and a genuine paper endpoint. Implementing it second, with no
  changes to the core, is the test that the port is real.

## Why not Robinhood (for real money)

Robinhood publishes **no official stock/options trading API**. Any integration
is a reverse-engineered client that (1) violates Robinhood's Terms of Service,
(2) breaks without notice when they rotate auth/endpoints, and (3) risks account
lockout. The port *can* host a `RobinhoodBroker` (the stub exists, flagged
`official_api=False`) to prove the abstraction — but do not route real capital
through it. If you want Robinhood specifically, the honest options are: accept
those risks explicitly, or pick a broker with an official API (Alpaca/Tradier/IBKR).

## Adding a broker (the whole job)

1. Implement `Broker` for the vendor in `execution_core/adapters/<name>.py`
   (`capabilities`, `get_positions`, `get_balances`, `place_order`, `cancel`,
   `get_order`), mapping the vendor API onto the shared domain types.
2. Keep `place_order` **idempotent on `client_key`**.
3. Isolate the network call behind an injectable seam; unit-test the parser
   against a fixture (the EIA/ISO pattern).
4. Nothing else changes — OMS, risk gate, TLH, and the spine are untouched.
