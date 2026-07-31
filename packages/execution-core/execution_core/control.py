"""Live control the engine reads every cycle and the terminal writes in real time.

This is what makes the app autonomous yet controllable: the order path has no
human-approval step, but two levers are adjustable at any moment —

- PAUSE / RESUME (your kill switch), and
- RISK LEVEL (Off / Low / Medium / High).

Defaults are the safe corner: PAUSED + SIM + OFF. A change takes effect on the
engine's next cycle (near real-time). Thread-safe: the engine loop reads while
the control API writes. The hard risk gate and auto-halts run regardless of this
state — control can only make the system *more* conservative, never bypass a cap.
"""

from __future__ import annotations

from enum import Enum
from threading import RLock


class RunState(str, Enum):
    RUNNING = "running"
    PAUSED = "paused"


class Autonomy(str, Enum):
    SIM = "sim"    # route to SimBroker only (paper)
    AUTO = "auto"  # place live orders, no human approval in the path


class RiskLevel(str, Enum):
    OFF = "off"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ControlState:
    def __init__(
        self,
        run: RunState = RunState.PAUSED,
        autonomy: Autonomy = Autonomy.SIM,
        risk: RiskLevel = RiskLevel.OFF,
    ) -> None:
        self._lock = RLock()
        self._run = run
        self._auto = autonomy
        self._risk = risk

    # --- real-time levers (terminal writes) ---
    def pause(self) -> None:
        with self._lock:
            self._run = RunState.PAUSED

    def resume(self) -> None:
        with self._lock:
            self._run = RunState.RUNNING

    def set_risk(self, level: RiskLevel) -> None:
        with self._lock:
            self._risk = level

    def set_autonomy(self, a: Autonomy) -> None:
        with self._lock:
            self._auto = a

    # --- engine reads each cycle ---
    def snapshot(self) -> tuple[RunState, Autonomy, RiskLevel]:
        with self._lock:
            return (self._run, self._auto, self._risk)

    def can_place_live(self) -> bool:
        """Autonomous live order allowed? Requires RUNNING + AUTO + risk on."""
        with self._lock:
            return (
                self._run == RunState.RUNNING
                and self._auto == Autonomy.AUTO
                and self._risk != RiskLevel.OFF
            )

    def can_simulate(self) -> bool:
        """Simulated (paper) order allowed? Requires RUNNING + risk on."""
        with self._lock:
            return self._run == RunState.RUNNING and self._risk != RiskLevel.OFF
