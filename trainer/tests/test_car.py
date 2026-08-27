"""Traction-circle car model: invariants over a (speed × steer × drive) grid."""

from __future__ import annotations

import math

import pytest

from apex_trainer.config import DEFAULT_PHYSICS as CFG
from apex_trainer.config import PhysicsConfig
from apex_trainer.sim.car import Action, CarState, StepResult, clamp_action, step_car

# The grip budget check tolerates float rounding in hypot/scaling only; 1e-9 m/s² is
# ~1e-10 of A — physically nothing, numerically far above double rounding.
BUDGET_EPS = 1e-9

SPEEDS = (0.0, 1e-12, 1e-9, 1e-6, 1e-3, 0.5, 2.0, 5.0, 10.0, 20.0, 29.999, 30.0)
UNIT_GRID = tuple(i / 4 for i in range(-4, 5))  # -1 … 1 in 0.25 steps


def _at(speed: float, heading: float = 0.3) -> CarState:
    return CarState(x=1.0, y=-2.0, heading=heading, speed=speed)


def _grid() -> list[tuple[float, float, float]]:
    return [(v, s, d) for v in SPEEDS for s in UNIT_GRID for d in UNIT_GRID]


def test_grid_outputs_are_finite_and_within_ranges() -> None:
    # Includes v = 0 and near-zero speeds: the ω = a_lat / v division would be
    # undefined there; step_car avoids it (see car.py docstring).
    for v, s, d in _grid():
        r = step_car(_at(v), Action(s, d), CFG)
        for value in (r.state.x, r.state.y, r.state.heading, r.state.speed, r.a_long, r.a_lat):
            assert math.isfinite(value), (v, s, d)
        assert 0.0 <= r.state.speed <= CFG.v_max
        assert -math.pi < r.state.heading <= math.pi


def test_traction_budget_never_exceeded() -> None:
    a2 = CFG.traction_accel_max**2
    for v, s, d in _grid():
        r = step_car(_at(v), Action(s, d), CFG)
        assert r.a_long**2 + r.a_lat**2 <= a2 + BUDGET_EPS, (v, s, d)


def test_over_budget_commands_are_scaled_uniformly_onto_the_circle() -> None:
    # At speed, full steer alone commands far more than A laterally; the result must
    # sit ON the circle with the commanded direction preserved (no per-axis clipping).
    v = 25.0
    for s, d in ((1.0, -1.0), (-1.0, -1.0), (1.0, 1.0), (0.5, -0.75), (1.0, 0.0)):
        r = step_car(_at(v), Action(s, d), CFG)
        cmd_long = d * (CFG.throttle_accel_max if d >= 0 else CFG.brake_accel_max)
        cmd_lat = v * (-s * CFG.steer_rate * v / CFG.v_max)
        assert math.hypot(cmd_long, cmd_lat) > CFG.traction_accel_max  # premise
        assert r.grip_used == pytest.approx(CFG.traction_accel_max, abs=BUDGET_EPS)
        # direction preserved: cross product of commanded and realized vectors is 0
        assert cmd_long * r.a_lat - cmd_lat * r.a_long == pytest.approx(0.0, abs=1e-9)
        assert math.copysign(1, r.a_long) == math.copysign(1, cmd_long) or cmd_long == 0
        assert math.copysign(1, r.a_lat) == math.copysign(1, cmd_lat)


def test_within_budget_commands_pass_through_unscaled() -> None:
    r = step_car(_at(5.0), Action(0.2, 0.5), CFG)
    assert r.a_long == pytest.approx(0.5 * CFG.throttle_accel_max)
    assert r.a_lat == pytest.approx(5.0 * (-0.2 * CFG.steer_rate * 5.0 / CFG.v_max))


def test_straight_line_acceleration_matches_closed_form() -> None:
    r = step_car(_at(0.0, heading=0.0), Action(0.0, 1.0), CFG)
    expected = CFG.throttle_accel_max * CFG.dt * (1 - CFG.drag * CFG.dt)
    assert r.state.speed == pytest.approx(expected)
    assert r.state.x == pytest.approx(1.0 + expected * CFG.dt)
    assert r.state.y == pytest.approx(-2.0)
    assert r.state.heading == 0.0
    assert (r.a_long, r.a_lat) == (CFG.throttle_accel_max, 0.0)


def test_throttle_and_brake_limits_are_asymmetric() -> None:
    assert step_car(_at(10.0), Action(0.0, 1.0), CFG).a_long == CFG.throttle_accel_max
    assert step_car(_at(10.0), Action(0.0, -1.0), CFG).a_long == -CFG.brake_accel_max
    assert CFG.brake_accel_max == CFG.traction_accel_max  # brakes can saturate grip


def test_braking_while_turning_trades_lateral_for_longitudinal() -> None:
    v = 25.0
    coasting = step_car(_at(v), Action(1.0, 0.0), CFG)
    braking = step_car(_at(v), Action(1.0, -1.0), CFG)
    assert abs(braking.a_lat) < abs(coasting.a_lat)
    assert braking.a_long < 0.0
    assert braking.grip_used == pytest.approx(CFG.traction_accel_max, abs=BUDGET_EPS)
    assert abs(coasting.a_lat) == pytest.approx(CFG.traction_accel_max, abs=BUDGET_EPS)


def test_no_acceleration_from_nothing() -> None:
    for v in SPEEDS:
        for s in UNIT_GRID:
            for d in (-1.0, -0.5, 0.0):
                assert step_car(_at(v), Action(s, d), CFG).state.speed <= v
    coasting = step_car(_at(10.0), Action(0.0, 0.0), CFG)
    assert coasting.state.speed == pytest.approx(10.0 * (1 - CFG.drag * CFG.dt))


def test_speed_is_clamped_at_v_max_and_zero() -> None:
    top = step_car(_at(CFG.v_max), Action(0.0, 1.0), CFG).state.speed
    assert top == pytest.approx(CFG.v_max * (1 - CFG.drag * CFG.dt))
    assert step_car(_at(0.1), Action(0.0, -1.0), CFG).state.speed == 0.0


def test_steer_sign_convention_right_is_clockwise() -> None:
    # SPEC §4.2 steer +1 = right; angles are CCW-positive, so heading decreases.
    right = step_car(_at(10.0, heading=0.0), Action(1.0, 0.0), CFG)
    left = step_car(_at(10.0, heading=0.0), Action(-1.0, 0.0), CFG)
    assert right.state.heading < 0.0 < left.state.heading
    assert right.a_lat < 0.0 < left.a_lat  # a_lat + = toward the car's left
    assert step_car(_at(0.0), Action(1.0, 0.0), CFG).state.heading == 0.3  # no yaw at rest


def test_lateral_accel_is_capped_by_grip_at_speed() -> None:
    # Full steer at v: |a_lat| = min(steer_rate·v²/v_max, A). Crosses A near v ≈ 15.5.
    for v in (5.0, 10.0, 15.0, 20.0, 30.0):
        r = step_car(_at(v), Action(-1.0, 0.0), CFG)
        expected = min(CFG.steer_rate * v * v / CFG.v_max, CFG.traction_accel_max)
        assert r.a_lat == pytest.approx(expected)


def test_actions_are_clamped() -> None:
    assert clamp_action(Action(3.0, -7.0)) == Action(1.0, -1.0)
    assert step_car(_at(10.0), Action(5.0, 5.0), CFG) == step_car(_at(10.0), Action(1.0, 1.0), CFG)


def test_deterministic_and_pure() -> None:
    s = _at(12.0)
    a = Action(0.3, -0.4)
    r1 = step_car(s, a, CFG)
    r2 = step_car(s, a, CFG)
    assert r1 == r2
    assert isinstance(r1, StepResult)
    assert s.speed == 12.0  # untouched


def test_config_is_serializable_and_reasoned() -> None:
    d = CFG.to_dict()
    assert d["dt"] == pytest.approx(1 / 60)
    assert PhysicsConfig(**d) == CFG
    assert CFG.throttle_accel_max / CFG.drag > CFG.v_max  # v_max reachable (see config)
