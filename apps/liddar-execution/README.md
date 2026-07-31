# liddar-execution (Workstream C)

Web-based trading application that connects to a Schwab account and executes
signals `selflearn-core` has scored as edge-positive net of cost and tax. Not
built at Gate 1 — this directory is the reserved home. See
`docs/solution-architecture.md` and `docs/tech-design.md` Section 4 for the
design, and `docs/power2026-build.md` Section 5 for scope and Gates 5–7.

Planned layout:

```
liddar-execution/
  broker/       # Broker ABC; SimBroker (local fills vs live quotes), SchwabBroker
  oms/          # order management: idempotent client keys, state machine, reconciler
  risk/         # pre-trade gate (pure, unit-tested): caps, buying power, allowlist
  tlh/          # lot ledger + harvest finder + wash-sale guard
  api/          # FastAPI execution control plane (approve / kill / positions)
  adapter.py    # feeds live fills back into selflearn-core as resolved outcomes
```

Non-negotiables (see guardrails, `power2026-build.md` Section 6):

- **No bypass.** The only path from signal to broker runs through the risk gate.
- **Idempotent orders.** Client-order keys; retries never double-send.
- **Broker is truth.** A reconciliation loop halts trading on any divergence.
- **Staged autonomy.** read-only → simulated → human-approves-each → auto-with-limits.
- **No HFT claim.** Schwab's retail API is not a colocated venue; target is
  low-latency event-driven, and the options signals are swing-horizon anyway.

`VERIFY` the Schwab Trader API surface, rate limits, streaming coverage, order
schema, and lot/cost-basis support before writing any broker code. There is no
official paper sandbox; "paper" means `SimBroker` filling against live quotes.

`TODO(jimmy)`: Schwab developer app (OAuth client id/secret, redirect URI),
account type (cash/margin), options approval level, taxable-account + cost-basis
method for TLH.
