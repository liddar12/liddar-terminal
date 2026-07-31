"""Configuration for the Power 2026 backtests.

Secrets come from the environment, never the repo. The EIA key is read here so
one place fails loudly with a clear message when it is missing, rather than a
data client throwing an opaque auth error deep in a call.
"""

from __future__ import annotations

import os

# Default ISO for H1 (Jimmy's Gate 2 call, default ERCOT; override via env).
DEFAULT_ISO = os.environ.get("POWER2026_ISO", "ERCOT")

# gridstatus path: 'oss' = free open-source library hitting ISO portals directly;
# 'hosted' = gridstatus.io API (needs GRIDSTATUS_API_KEY). VERIFY hosted pricing.
GRIDSTATUS_MODE = os.environ.get("GRIDSTATUS_MODE", "oss")


def eia_api_key() -> str:
    """Return the EIA API key or raise a clear, actionable error.

    Register (free, instant) at the EIA open-data site and set EIA_API_KEY in
    this environment's variables. VERIFY the current registration URL.
    """
    key = os.environ.get("EIA_API_KEY")
    if not key:
        raise RuntimeError(
            "EIA_API_KEY is not set. Register (free) at the EIA open-data site "
            "and set EIA_API_KEY in this environment's variables. Gate 2 blocker."
        )
    return key
