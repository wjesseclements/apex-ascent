"""A deterministic scripted driver: a hand-written controller used for golden
pins, debug plots and (Slice 3) sanity baselines. It is NOT a policy anyone
trains — just a reference that laps both tracks without crashing.

Steering: turn toward the more open side of the ray fan. Drive: chase a target
speed set by how far the road ahead is clear.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from apex_trainer.config import SimConfig
from apex_trainer.sim.car import Action
from apex_trainer.sim.raycast import RayHit


@dataclass(frozen=True)
class ScriptedDriverConfig:
    steer_gain: float = 2.0
    """Steer per unit of (right − left) normalized openness."""
    lookahead_gain: float = 0.55
    """Target speed = lookahead_gain · sqrt(2 · brake · clear_ahead): the fraction of
    the physically possible stopping speed used, leaving margin for cornering."""
    speed_gain: float = 0.5
    """Drive per m/s of speed error (clamped to [−1, 1])."""


DEFAULT_SCRIPTED = ScriptedDriverConfig()


def scripted_action(
    rays: tuple[RayHit, ...], speed: float, cfg: SimConfig, driver: ScriptedDriverConfig
) -> Action:
    offsets = cfg.rays.offsets()
    max_len = cfg.rays.max_length
    # Openness weighted toward forward-looking rays. Offsets are CCW-positive:
    # negative = right, positive = left.
    right = left = 0.0
    ahead = max_len
    for ray, off in zip(rays, offsets, strict=True):
        w = math.cos(off) + 0.05
        d = ray.distance / max_len
        if off < 0:
            right += w * d
        elif off > 0:
            left += w * d
        if abs(off) <= math.radians(20):
            ahead = min(ahead, ray.distance)
    steer = driver.steer_gain * (right - left)
    steer = max(-1.0, min(1.0, steer))

    brake = cfg.physics.brake_accel_max
    v_target = driver.lookahead_gain * math.sqrt(2.0 * brake * max(ahead, 0.0))
    v_target = min(v_target, cfg.physics.v_max)
    drive = max(-1.0, min(1.0, driver.speed_gain * (v_target - speed)))
    return Action(steer=steer, drive=drive)
