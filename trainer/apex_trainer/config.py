"""The one typed config module (CLAUDE.md trainer rule 2).

Every constant the trainer uses lives here, with its unit and a one-line reason.
No magic numbers anywhere else. Configs are frozen dataclasses so they can be
hashed, compared, and serialized into every run directory.

Grows per slice: physics (Slice 2), rays/observation/reward/episode (Slice 3),
PPO deviations from SB3 defaults (Slice 4).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class PhysicsConfig:
    """Car model + traction circle (SPEC §3.1–3.2). Units: m, s, rad."""

    dt: float = 1.0 / 60.0
    """Fixed simulation timestep, s. SPEC §3.1: no variable dt anywhere."""

    traction_accel_max: float = 20.0
    """A, m/s²: the grip budget a_long² + a_lat² ≤ A². Matches the GA's lateral cap
    so speeds land in a familiar range (SPEC §3.2)."""

    throttle_accel_max: float = 12.0
    """m/s²: full-throttle longitudinal acceleration. Engine-limited below A, as in
    apex-evolve (approved Slice 2 decision) — keeps straight-line speeds comparable."""

    brake_accel_max: float = 20.0
    """m/s²: full-brake deceleration. Equal to A: brakes can saturate the grip circle,
    which is what makes trading braking for cornering (trail-braking) the optimal
    thing to discover (approved Slice 2 decision)."""

    v_max: float = 30.0
    """m/s: hard speed clamp, GA parity (approved). Terminal speed from drag alone
    (throttle_accel_max / drag = 40 m/s) is above this, so v_max is reachable."""

    drag: float = 0.3
    """1/s: linear drag, v *= (1 − drag·dt) each tick, GA parity (approved)."""

    steer_rate: float = 2.5
    """rad/s: commanded yaw rate at full steer and v = v_max, GA parity. The circle
    then limits lateral accel v·ω to ≤ A, so at speed the car understeers unless it
    slows: at v_max the raw command implies 75 m/s² lateral, far over A = 20."""

    start_speed: float = 2.0
    """m/s: initial speed on the start line, avoids a degenerate standing start
    (SPEC §3.4)."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_PHYSICS = PhysicsConfig()
