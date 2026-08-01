"""Walk-forward demo over the real 14-name universe — with SYNTHETIC bars.

WHY SYNTHETIC: no market-data feed is wired (Schwab/FRED/EIA need keys, all
TODO(jimmy); the sandbox blocks other data hosts). This script proves the harness
runs end-to-end and shows the exact cohort-scored output. The bars are a seeded
random walk, so the honest expected result is ~50% hit-rate with wide intervals —
the harness does NOT manufacture edge from noise. Swap InMemoryBarSource for a
real feed and the same code produces a real read.

Run: python -m examples.walkforward_demo   (from packages/selflearn-core)
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from selflearn_core.backtest import run_walkforward, score_resolved, trend_signal
from selflearn_core.features import Bar, InMemoryBarSource

N_BARS = 400
HORIZON = 5
UNIVERSE = (
    Path(__file__).resolve().parents[3]
    / "apps" / "liddar-execution" / "config" / "universe.json"
)


def _synthetic_bars(ticker: str, n: int = N_BARS) -> list[Bar]:
    """Deterministic seeded random walk — same ticker always yields the same
    series (no Math.random, reproducible)."""
    price = 100.0
    bars: list[Bar] = []
    for i in range(n):
        seed = hashlib.sha256(f"{ticker}:{i}".encode()).digest()
        # map 2 bytes to a small signed daily return in ~[-1.5%, +1.5%]
        r = ((seed[0] << 8 | seed[1]) / 65535.0 - 0.5) * 0.03
        prev = price
        price = max(1.0, price * (1.0 + r))
        bars.append(Bar(
            ts=86400 * (i + 1), open=prev,
            high=max(prev, price) * 1.001, low=min(prev, price) * 0.999,
            close=price, volume=1_000_000.0,
        ))
    return bars


def main() -> None:
    universe = json.loads(UNIVERSE.read_text())
    by_cohort: dict[str, list] = {"liquid": [], "thin": []}
    rows: list[tuple[str, str, list]] = []

    for sector in universe["sectors"]:
        for side in ("high", "low"):
            name = sector[side]
            ticker, cohort = name["ticker"], name["cohort"]
            src = InMemoryBarSource({ticker: _synthetic_bars(ticker)})
            resolved = run_walkforward(src, ticker, trend_signal, horizon_bars=HORIZON)
            rows.append((ticker, cohort, resolved))
            by_cohort[cohort].extend(resolved)

    bar = "=" * 68
    print(bar)
    print(" SYNTHETIC DATA — pipeline validation only. NOT an edge claim.")
    print(f" universe: {UNIVERSE.name} | {N_BARS} bars/name | horizon {HORIZON}")
    print(bar)
    print(f"{'ticker':<8}{'cohort':<9}{'trades':>7}{'hit_rate':>10}{'  95% CI':>16}")
    print("-" * 68)
    for ticker, cohort, resolved in rows:
        scores = {s.metric: s for s in score_resolved(resolved, cohort=cohort)}
        hr = scores.get("hit_rate")
        if hr is None:
            print(f"{ticker:<8}{cohort:<9}{0:>7}{'  n/a':>10}")
            continue
        ci = f"[{hr.ci_low:.2f}, {hr.ci_high:.2f}]"
        print(f"{ticker:<8}{cohort:<9}{hr.n:>7}{hr.value:>10.3f}{ci:>16}")

    print("-" * 68)
    for cohort in ("liquid", "thin"):
        scores = {s.metric: s for s in score_resolved(by_cohort[cohort], cohort=cohort)}
        hr = scores["hit_rate"]
        mr = scores["mean_signed_return"]
        ci = f"[{hr.ci_low:.2f}, {hr.ci_high:.2f}]"
        print(f"{cohort.upper():<8}{'(all)':<9}{hr.n:>7}{hr.value:>10.3f}{ci:>16}"
              f"   mean {mr.value*1e4:+.1f} bps")
    print(bar)
    print(" Read: on noise, hit-rates sit near 0.50 and the CIs straddle it —")
    print(" exactly right. Real bars via a live BarSource give a real read.")
    print(bar)


if __name__ == "__main__":
    main()
