"""One world = one car on one track: composes car, containment, progress and
raycasts into a single pure ``step`` (SPEC §3.4 episode rules, minus the
step limit, which is the env's truncation rule in Slice 3).

Crash rule (approved Slice 2 decision): the episode terminates when the
**car's center point** leaves the drivable region. Car dimensions are
render-only. Note this is ~0.9 m more usable width per side than apex-evolve's
four-corner rule (the GA car was 1.8 m wide), so lap-time comparisons against
the GA are on slightly friendly terms.

Laps: completing a lap does NOT end the episode (SPEC §3.4); lap times are
recorded per forward crossing of the start line. ``laps`` can drop if the car
reverses back over the line, but recorded lap times are never removed.

Conventions: ``apex_trainer.sim``.
"""

from __future__ import annotations

from dataclasses import dataclass

from apex_trainer.config import SimConfig
from apex_trainer.sim.car import Action, CarState, step_car
from apex_trainer.sim.containment import is_inside_track
from apex_trainer.sim.progress import (
    ProgressState,
    initial_progress,
    laps_completed,
    update_progress,
)
from apex_trainer.sim.raycast import RayHit, cast_fan
from apex_trainer.sim.track import Track


@dataclass(frozen=True)
class WorldState:
    car: CarState
    progress: ProgressState
    tick: int
    """Ticks simulated since reset."""
    crashed: bool
    laps: int
    """Completed laps implied by progress (⌊s / L⌋)."""
    lap_times: tuple[float, ...]
    """Seconds per completed lap, in order. Never shrinks."""
    lap_start_tick: int
    """Tick at which the current lap began."""


@dataclass(frozen=True)
class StepTelemetry:
    a_long: float
    a_lat: float
    delta_s: float
    """Progress gained this tick, m (the Slice 3 reward's dense term)."""
    lap_completed: bool


def world_time(state: WorldState, cfg: SimConfig) -> float:
    return state.tick * cfg.physics.dt


def reset(track: Track, cfg: SimConfig) -> WorldState:
    """Car on the start line, centered, heading along the track, at start_speed."""
    car = CarState(
        x=track.start.x, y=track.start.y, heading=track.start.heading, speed=cfg.physics.start_speed
    )
    return WorldState(
        car=car,
        progress=initial_progress(track, (car.x, car.y)),
        tick=0,
        crashed=False,
        laps=0,
        lap_times=(),
        lap_start_tick=0,
    )


def step(
    track: Track, state: WorldState, action: Action, cfg: SimConfig
) -> tuple[WorldState, StepTelemetry]:
    """Advance one tick. Raises if the world has already crashed (reset it)."""
    if state.crashed:
        raise ValueError("cannot step a crashed world; call reset()")
    result = step_car(state.car, action, cfg.physics)
    car = result.state
    position = (car.x, car.y)
    inside = is_inside_track(track, position, state.progress.segment)
    progress, delta_s = update_progress(track, state.progress, position)
    tick = state.tick + 1

    laps = laps_completed(progress.s, track)
    lap_times = state.lap_times
    lap_start_tick = state.lap_start_tick
    lap_completed = laps > len(lap_times)
    if lap_completed:
        lap_times = (*lap_times, (tick - lap_start_tick) * cfg.physics.dt)
        lap_start_tick = tick

    new_state = WorldState(
        car=car,
        progress=progress,
        tick=tick,
        crashed=not inside.inside,
        laps=laps,
        lap_times=lap_times,
        lap_start_tick=lap_start_tick,
    )
    telemetry = StepTelemetry(
        a_long=result.a_long, a_lat=result.a_lat, delta_s=delta_s, lap_completed=lap_completed
    )
    return new_state, telemetry


def sense(track: Track, state: WorldState, cfg: SimConfig) -> tuple[RayHit, ...]:
    """The ray fan from the car's current pose."""
    car = state.car
    return cast_fan(
        track,
        (car.x, car.y),
        car.heading,
        cfg.rays.offsets(),
        cfg.rays.max_length,
        state.progress.segment,
    )
