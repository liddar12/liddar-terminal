# Test universe: liquid vs thin, one pair per sector

The set the first backtests run against. One **high-volume (liquid)** and one
**low-volume (thin)** name per sector, on purpose: liquidity is a scoring cohort,
not a footnote. Thin names have gappier candles (`gap`, `range_pct`,
`vol_ratio_20` are noisier) and worse fills, so a signal's calibration on NVDA
tells you little about the same signal on a thin small-cap. Scoring by liquidity
cohort keeps us from averaging the two into a number that's true for neither.

Machine-readable: `apps/liddar-execution/config/universe.json`.

| Sector | High volume (liquid) | Low volume (thin) |
|---|---|---|
| AI stock | **NVDA** — NVIDIA | **AI** — C3.ai |
| Hyperscaler | **MSFT** — Microsoft | **CRWV** — CoreWeave (neocloud, newer/thinner) |
| Oil | **XOM** — ExxonMobil | **REI** — Ring Energy (small-cap E&P) |
| Gas & fuel | **EQT** — largest US natgas producer | **GPOR** — Gulfport Energy (natgas) |
| Finance & banking | **BAC** — Bank of America (top big-bank share volume) | **NRIM** — Northrim BanCorp (thin regional) |
| Commodity (gold) | **GLD** — SPDR Gold Shares | **SGOL** — abrdn Physical Gold (same exposure, lower volume) |
| Bond market | **TLT** — iShares 20+ Yr Treasury | **ZROZ** — PIMCO 25+ Yr Zero-Coupon STRIPS (thinner) |

## Why these picks

- **Hold the exposure, vary the volume where possible.** Gold (`GLD`/`SGOL`) and
  bonds (`TLT`/`ZROZ`) are near-identical bets at very different liquidity — the
  cleanest read on how volume alone changes the features.
- **Equities add a size factor.** In AI/hyperscaler/oil/gas/banking the thin name
  is also small-cap, so "thin" there bundles liquidity **and** size. That's a
  confound to control for when scoring, noted in the config.
- **Cross-checks with the macro families.** The oil/gas/gold names line up with
  the `commodities` feature family, and the AI/hyperscaler names with `ai_infra`
  — so once macro features land we can test whether, say, the gold curve actually
  moves `GLD` differently than it moves a thin miner.

## Honesty labels

- **[verified]** every ticker is real and trades on a US venue.
- **[VERIFY]** the high/low volume ranking is from training knowledge. Confirm
  each name's live average daily volume before wiring — liquidity shifts, and
  `CRWV` (2025 IPO) especially needs a current read.
- Alternates in the config: refiners `VLO`/`MPC` for the fuel angle; higher-beta
  gold miners `HMY`/`DRD` if we want miner behavior instead of spot.

This universe is deliberately small (14 names). It's a **test bench**, not a
trading universe — enough to exercise the features across regimes and expose
liquidity effects, not a claim about what to trade.
