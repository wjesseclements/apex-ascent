"""Roll the scripted driver out on a track and record per-tick samples.

Shared by the golden-pin generator, the debug plot and tests. Pure apart from
being a loop; no IO.
"""

from __future__ import annotations

from dataclasses import dataclass

from apex_trainer.config import SimConfig
from apex_trainer.sim.raycast import RayHit
from apex_trainer.sim.scripted import DEFAULT_SCRIPTED, ScriptedDriverConfig, scripted_action
from apex_trainer.sim.track import Track
from apex_trainer.sim.world import WorldState, reset, sense, step


@dataclass(frozen=True)
class Sample:
    tick: int
    x: float
    y: float
    heading: float
    speed: float
    s: float
    steer: float
    drive: float
    a_long: float
    a_lat: float
    rays: tuple[RayHit, ...]


def rollout_scripted(
    track: Track,
    cfg: SimConfig,
    ticks: int,
    driver: ScriptedDriverConfig = DEFAULT_SCRIPTED,
) -> tuple[list[Sample], WorldState]:
    """Run the scripted driver for ``ticks`` ticks (or until it crashes)."""
    w = reset(track, cfg)
    samples: list[Sample] = []
    for _ in range(ticks):
        rays = sense(track, w, cfg)
        action = scripted_action(rays, w.car.speed, cfg, driver)
        w, t = step(track, w, action, cfg)
        samples.append(
            Sample(
                tick=w.tick,
                x=w.car.x,
                y=w.car.y,
                heading=w.car.heading,
                speed=w.car.speed,
                s=w.progress.s,
                steer=action.steer,
                drive=action.drive,
                a_long=t.a_long,
                a_lat=t.a_lat,
                rays=rays,
            )
        )
        if w.crashed:
            break
    return samples, w
