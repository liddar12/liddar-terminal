"""Live control-state tests. Pure, no threads exercised (logic only)."""

from execution_core.control import Autonomy, ControlState, RiskLevel, RunState


def test_default_is_the_safe_corner():
    c = ControlState()
    assert c.snapshot() == (RunState.PAUSED, Autonomy.SIM, RiskLevel.OFF)
    assert c.can_place_live() is False
    assert c.can_simulate() is False


def test_autonomous_live_requires_running_auto_and_risk_on():
    c = ControlState()
    c.resume(); c.set_autonomy(Autonomy.AUTO); c.set_risk(RiskLevel.MEDIUM)
    assert c.can_place_live() is True         # no human approval needed


def test_pause_halts_immediately():
    c = ControlState(RunState.RUNNING, Autonomy.AUTO, RiskLevel.HIGH)
    assert c.can_place_live() is True
    c.pause()
    assert c.can_place_live() is False        # real-time stop


def test_risk_off_blocks_trading_but_keeps_running():
    c = ControlState(RunState.RUNNING, Autonomy.AUTO, RiskLevel.HIGH)
    c.set_risk(RiskLevel.OFF)
    assert c.can_place_live() is False and c.can_simulate() is False


def test_sim_autonomy_simulates_but_never_places_live():
    c = ControlState(RunState.RUNNING, Autonomy.SIM, RiskLevel.LOW)
    assert c.can_simulate() is True
    assert c.can_place_live() is False
