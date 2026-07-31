# Data Sources

Candidate data providers to widen backtesting coverage, mapped to what they
supply and which horizons they serve. **Every specific below is `VERIFY`** —
confirm free-tier limits, coverage, history depth, and ToS against the
provider's current docs before wiring. Names and roles are from general
knowledge (cutoff Jan 2026), not live-checked.

## Requirement: allowlist each host

Cloud sessions block outbound traffic by default (this is why `api.eia.gov` was
denied until allowlisted). Before a provider can be used, add its host to the
environment's **Custom → Allowed domains** list (same step as EIA), keep "Also
include default list of common package managers" checked, and start a new
session. MCP connectors are the exception (their traffic goes through Anthropic).

## Providers

| Provider | Asset classes | What it gives | Cost | Horizon fit |
|---|---|---|---|---|
| Schwab Trader API | equities, options | Quotes, history, chains for the trading account | account | 1d–max |
| Polygon.io | equities, options, FX | Aggregates, trades/quotes, options chains | free tier + paid | 1d–max |
| Databento | equities, futures, options | Normalized historical + live market data | paid | 1d–max |
| Tiingo | equities, fundamentals | EOD + intraday, news | free tier + paid | 5d–max |
| Alpha Vantage | equities, FX, crypto | EOD/intraday, some indicators | free (rate-limited) | 5d–max |
| Finnhub | equities, fundamentals | Quotes, candles, some options | free tier + paid | 1d–max |
| CBOE DataShop | options | Historical options + implied vol | paid | 1d–max |
| ORATS | options | Historical options, IV surfaces, greeks | paid | 1d–max |
| Nasdaq Data Link | multi | Curated datasets (some free) | mixed | varies |
| FRED (St. Louis Fed) | macro | Rates, macro series | free (key) | 1m–max |
| EIA v2 + gridstatus | power/energy | Gas prices, ISO LMPs (Workstream A) | free / mixed | 1d–max |

Notes:
- **Options history is the expensive, high-value piece.** The scanner produces
  options ideas, so historical options + IV (CBOE/ORATS, or Polygon's options)
  are what make option-signal backtests honest. Equity-only sources can't
  properly price an options idea.
- **Unofficial scrapers (e.g. yfinance) carry ToS risk** and unstable schemas.
  Fine for exploration; not for anything the execution app depends on.
- **Schwab is both broker and a data source.** Using its own history for
  backtests keeps sim and live on the same price basis (less sim/live drift).

## Integration pattern

All providers implement `signals.providers.MarketDataProvider` (`daily_bars`,
`option_chain`), with the network fetch isolated behind an injectable seam and a
pure parser that's unit-tested against a fixture, exactly like `EiaClient` /
`IsoClient`. One interface, swappable vendors, no sim/live parser drift.

## Multi-horizon backtesting

Horizons are defined once in `selflearn_core.horizons` (1d, 5d, 1m, 3m, 6m, 1y,
5y, max) and used both as holding horizons and as scoring windows. `run_*_multi`
runs a hypothesis across all horizons that fit the available history and skips
(never silently) any that don't. `max` is a full-history fit. Deeper history
from the providers above directly increases how many horizons a signal can be
evaluated over.
