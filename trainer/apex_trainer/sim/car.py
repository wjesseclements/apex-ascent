"""The car: 2-D kinematic model under traction-circle physics (SPEC §3.1–3.2).

State: position, heading, forward speed. Controls: ``steer`` and ``drive`` in
[-1, 1] (SPEC §4.2). Conventions: ``apex_trainer.sim`` — angles CCW-positive,
so steer +1 (right) produces a *negative* heading rate; that sign flip lives
here and nowhere else.

Per-tick order (``step_car``), with ``v`` the speed at the start of the tick:

1. **Command.** ``a_long_cmd = drive · throttle_accel_max`` (drive ≥ 0) or
   ``drive · brake_accel_max`` (drive < 0). ``ω_cmd = −steer · steer_rate · (v / v_max)``
   (yaw rate scaled by speed: no turning at standstill, as in the GA model).
   ``a_lat_cmd = v · ω_cmd``.
2. **Traction circle.** If ``a_long_cmd² + a_lat_cmd² > A²`` the whole vector
   is scaled by ``k = A / |a_cmd|`` — uniformly, so its direction is preserved
   (SPEC: no clipping of one axis before the other). Otherwise ``k = 1``.
3. **Apply.** ``v' = clamp(v + a_long · dt, 0, v_max) · (1 − drag · dt)``;
   ``θ' = wrap(θ + ω · dt)`` with ``ω = k · ω_cmd``;
   ``pos' = pos + (cos θ', sin θ') · v' · dt``.

Why ``ω = k · ω_cmd`` and not ``a_lat / v``: they are algebraically identical
(``a_lat = k · v · ω_cmd``), but the division is undefined at ``v = 0``. Using
``k · ω_cmd`` keeps every output finite for every action at every speed,
including exactly zero (property-tested). ``k`` itself is always finite because
it is only computed when ``|a_cmd| > A > 0``.

The reported ``a_long`` / ``a_lat`` are the traction-scaled *commanded*
accelerations — what the tyres are asked for — which is what the grip-budget
invariant and the g-g widget are about. At the speed clamps (v = 0 while
braking, v = v_max while accelerating) the realized speed change is smaller.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from apex_trainer.config import PhysicsConfig
from apex_trainer.sim.geometry import wrap_angle


@dataclass(frozen=True)
class CarState:
    x: float
    y: float
    heading: float
    """Radians, CCW from +x, wrapped to (-π, π]."""
    speed: float
    """Forward speed, m/s, always within [0, v_max]. No reverse gear."""


@dataclass(frozen=True)
class Action:
    steer: float
    """[-1, 1]: +1 full right, -1 full left."""
    drive: float
    """[-1, 1]: +1 full throttle, -1 full brake."""


NEUTRAL_ACTION = Action(steer=0.0, drive=0.0)


@dataclass(frozen=True)
class StepResult:
    state: CarState
    a_long: float
    """Traction-scaled longitudinal acceleration, m/s² (+ throttle, − brake)."""
    a_lat: float
    """Traction-scaled lateral acceleration, m/s² (+ = toward the car's left)."""

    @property
    def grip_used(self) -> float:
        """|a| / A style magnitude, m/s²: sqrt(a_long² + a_lat²)."""
        return math.hypot(self.a_long, self.a_lat)


def _clamp_unit(v: float) -> float:
    return -1.0 if v < -1.0 else 1.0 if v > 1.0 else v


def clamp_action(action: Action) -> Action:
    """Clamp both channels into [-1, 1]."""
    return Action(steer=_clamp_unit(action.steer), drive=_clamp_unit(action.drive))


def create_car_state(x: float, y: float, heading: float, speed: float) -> CarState:
    return CarState(x=x, y=y, heading=wrap_angle(heading), speed=speed)


def step_car(state: CarState, action: Action, cfg: PhysicsConfig) -> StepResult:
    """Advance the car by one fixed timestep ``cfg.dt``. Pure; does not mutate."""
    clamped = clamp_action(action)
    steer, drive = clamped.steer, clamped.drive
    v = state.speed

    # 1. Commanded accelerations.
    a_long_cmd = drive * (cfg.throttle_accel_max if drive >= 0.0 else cfg.brake_accel_max)
    omega_cmd = -steer * cfg.steer_rate * (v / cfg.v_max)  # right = clockwise = negative
    a_lat_cmd = v * omega_cmd

    # 2. Traction circle: uniform scaling back onto the circle.
    a_max = cfg.traction_accel_max
    mag = math.hypot(a_long_cmd, a_lat_cmd)
    k = a_max / mag if mag > a_max else 1.0
    a_long = a_long_cmd * k
    a_lat = a_lat_cmd * k
    omega = omega_cmd * k

    # 3. Apply.
    speed = v + a_long * cfg.dt
    if speed < 0.0:
        speed = 0.0
    elif speed > cfg.v_max:
        speed = cfg.v_max
    speed *= 1.0 - cfg.drag * cfg.dt

    heading = wrap_angle(state.heading + omega * cfg.dt)
    x = state.x + math.cos(heading) * speed * cfg.dt
    y = state.y + math.sin(heading) * speed * cfg.dt

    return StepResult(
        state=CarState(x=x, y=y, heading=heading, speed=speed), a_long=a_long, a_lat=a_lat
    )
