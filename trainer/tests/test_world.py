"""World-level invariants on both real tracks: out-of-bounds ⇔ crashed, grip budget
never exceeded end-to-end, progress consistent with position, lap accounting."""

from __future__ import annotations

import random

import pytest

from apex_trainer.config import DEFAULT_SIM as CFG
from apex_trainer.sim.car import Action
from apex_trainer.sim.containment import is_inside_track
from apex_trainer.sim.progress import arc_position
from apex_trainer.sim.scripted import DEFAULT_SCRIPTED, scripted_action
from apex_trainer.sim.track import Track
from apex_trainer.sim.world import WorldState, reset, sense, step, world_time

BUDGET_EPS = 1e-9
# s % L must equal the fresh projection of the position up to rounding.
ARC_TOL = 1e-6
RANDOM_TAPE_SEEDS = (1, 2, 3, 4, 5)
RANDOM_TAPE_TICKS = 600


def _random_tape(seed: int, n: int) -> list[Action]:
    """Random steering with the throttle held on. (Uniform random drive averages to
    zero and, with brake 20 > throttle 12, the car just dithers on the line.)"""
    rng = random.Random(seed)  # deterministic: the tape is fixed by its seed
    return [Action(rng.uniform(-1, 1), rng.uniform(0.2, 1.0)) for _ in range(n)]


def test_reset_is_on_the_start_line_at_start_speed(any_track: Track) -> None:
    w = reset(any_track, CFG)
    assert (w.car.x, w.car.y, w.car.heading) == (0.0, 0.0, 0.0)
    assert w.car.speed == CFG.physics.start_speed
    assert w.progress.s == 0.0
    assert not w.crashed and w.laps == 0 and w.lap_times == () and w.tick == 0
    assert world_time(w, CFG) == 0.0


@pytest.mark.parametrize("seed", RANDOM_TAPE_SEEDS)
def test_random_tapes_hold_the_invariants(any_track: Track, seed: int) -> None:
    w = reset(any_track, CFG)
    a2 = CFG.physics.traction_accel_max**2
    L = any_track.total_length
    for action in _random_tape(seed, RANDOM_TAPE_TICKS):
        if w.crashed:
            break
        w, t = step(any_track, w, action, CFG)
        # out-of-bounds ⇔ crashed
        assert w.crashed == (not is_inside_track(any_track, (w.car.x, w.car.y)).inside)
        # traction budget never exceeded
        assert t.a_long**2 + t.a_lat**2 <= a2 + BUDGET_EPS
        # progress is the projection of the position (unwrapped)
        arc, _ = arc_position(any_track, (w.car.x, w.car.y))
        assert (w.progress.s % L) == pytest.approx(arc, abs=ARC_TOL) or abs(
            (w.progress.s % L) - arc
        ) == pytest.approx(L, abs=ARC_TOL)
        assert w.tick <= RANDOM_TAPE_TICKS
    # a wild driver on a 12 m track crashes well within 10 s (sanity: the wall is real)
    assert w.crashed, "wild tape never crashed"


def test_stepping_a_crashed_world_raises(track_a: Track) -> None:
    w = reset(track_a, CFG)
    # Full left at start speed is too slow to turn; drive straight into... nothing.
    # Force a crash by teleporting: build a crashed state explicitly.
    crashed = WorldState(
        car=w.car,
        progress=w.progress,
        tick=1,
        crashed=True,
        laps=0,
        lap_times=(),
        lap_start_tick=0,
    )
    with pytest.raises(ValueError, match="crashed"):
        step(track_a, crashed, Action(0.0, 0.0), CFG)


def test_scripted_driver_laps_both_tracks_without_crashing(any_track: Track) -> None:
    w = reset(any_track, CFG)
    ticks = int(60.0 / CFG.physics.dt)
    for _ in range(ticks):
        action = scripted_action(sense(any_track, w, CFG), w.car.speed, CFG, DEFAULT_SCRIPTED)
        w, _t = step(any_track, w, action, CFG)
        assert not w.crashed, f"scripted driver crashed at t={world_time(w, CFG):.2f}s"
    assert w.laps >= 1
    assert len(w.lap_times) == w.laps
    # Lap times must be physically plausible: faster than a 10 m/s cruise, slower than
    # the GA champion's 13.6 s (the scripted driver is deliberately conservative).
    for lap in w.lap_times:
        assert 13.6 < lap < any_track.total_length / 10.0


def test_lap_accounting_on_the_start_line(track_a: Track) -> None:
    # Drive the scripted driver until the first lap completes, then check bookkeeping.
    w = reset(track_a, CFG)
    completed_at: int | None = None
    for _ in range(int(60.0 / CFG.physics.dt)):
        action = scripted_action(sense(track_a, w, CFG), w.car.speed, CFG, DEFAULT_SCRIPTED)
        w, t = step(track_a, w, action, CFG)
        if t.lap_completed:
            completed_at = w.tick
            break
    assert completed_at is not None
    assert w.laps == 1 and len(w.lap_times) == 1
    assert w.lap_times[0] == pytest.approx(completed_at * CFG.physics.dt)
    assert w.lap_start_tick == completed_at
    assert w.progress.s >= track_a.total_length


def test_sense_returns_one_reading_per_ray_within_range(any_track: Track) -> None:
    w = reset(any_track, CFG)
    rays = sense(any_track, w, CFG)
    assert len(rays) == CFG.rays.count
    for r in rays:
        assert 0.0 < r.distance <= CFG.rays.max_length
