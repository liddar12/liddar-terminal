# Strategy Concepts (clean-room)

Catalog of public strategy *concepts* we implement from their definitions, plus
the policy that keeps us clear of anyone's copyrighted code.

## Policy: concepts yes, code no

- **Ideas aren't copyrightable; specific code is.** We implement indicators and
  rules from their published mathematical definitions (public domain). We do not
  copy TradingView/Pine scripts, GitHub repos, or any vendor's source.
- **No scraping.** TradingView's ToS prohibits scraping, and Pine scripts are
  their authors' copyrighted works. We don't scrape or lift them. Reading a
  public description of a strategy to understand the *idea* is fine; pasting its
  code is not.
- **Attribution/licensing.** If we ever adopt a third-party implementation, it
  must carry a compatible open-source license and be recorded here. Default is
  clean-room from formula.

Implementations live in `packages/signals` (`indicators.py`), each written from
the formula and unit-tested. Current: SMA, Wilder's RSI, Donchian breakout.

## Concept catalog

Concepts grouped by family, with the horizons (see `selflearn_core.horizons`)
they tend to suit. All are ideas to implement clean-room, then validate through
`selflearn-core` like any other signal (no concept is trusted until scored).

| Family | Concept | Idea (one line) | Typical horizons |
|---|---|---|---|
| Trend / momentum | MA crossover | Fast MA over slow MA = trend up | 1m–1y |
| Trend / momentum | Cross-sectional momentum | Buy recent relative winners | 1m–1y |
| Mean reversion | RSI extremes | Fade overbought/oversold | 1d–1m |
| Mean reversion | Bollinger reversion | Fade moves far from a moving average | 1d–1m |
| Breakout | Donchian / range break | Trade new highs/lows of a window | 5d–3m |
| Breakout | Opening-range breakout | Break of the first-N-minutes range | 1d |
| Volatility | ATR position sizing | Size inversely to recent volatility | all |
| Volatility | Vol-carry / IV-vs-RV | Options rich/cheap vs realized vol | 5d–3m |
| Options-specific | Delta/expected-move filters | Screen ideas by liquidity + expected move | 1d–1m |

Each row is a hypothesis, not a recommendation. The self-learning loop decides
which survive, per cohort and per horizon, net of cost and (for execution) tax.

## How a concept becomes a live signal

1. Implement the indicator clean-room in `packages/signals` with tests.
2. Express a rule (entry/exit) as a pure function over bars/indicators.
3. Wrap it in a `selflearn-core` adapter so every call is logged.
4. Backtest across the 1d..max horizons (`run_*_multi`), score by cohort+horizon.
5. Promote only what shows a calibrated, net-positive edge. Manual gate.
