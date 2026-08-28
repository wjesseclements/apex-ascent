"""Progress along the track: unwrapped arc-length of the car's centerline
projection (SPEC §3.3, §5).

Model — ``s`` is an UNWRAPPED arc coordinate: it starts at the spawn arc and
each tick adds the *signed* forward displacement of the projection, wrapped
into (−L/2, L/2] so a car cannot "jump" half a lap in one tick either way.
Laps completed = ⌊s / L⌋; the reward in Slice 3 is Δs per step.

No checkpoints (unlike apex-evolve): there, fitness was "max progress", so
backing up or shortcuts had to be policed. Here the reward is Δs — driving
backwards is negative reward, oscillating across the projection nets zero,
and cutting corners through the wall crashes first (SPEC §5 hacking watch).
Property-tested in ``tests/test_progress.py``.

Conventions: ``apex_trainer.sim``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from apex_trainer.sim.containment import nearest_segment
from apex_trainer.sim.geometry import Vec2
from apex_trainer.sim.track import Track


@dataclass(frozen=True)
class ProgressState:
    s: float
    """Unwrapped arc coordinate of the car's centerline projection, m."""
    segment: int
    """Nearest centerline segment — the localization hint for the next tick."""


def arc_position(track: Track, p: Vec2, hint: int | None = None) -> tuple[float, int]:
    """Arc length in [0, L) of the projection of ``p`` and its segment index."""
    near = nearest_segment(track, p, hint)
    arc = track.segment_start[near.index] + near.t * track.segment_lengths[near.index]
    if arc >= track.total_length:  # t == 1 on the last segment
        arc -= track.total_length
    return arc, near.index


def initial_progress(track: Track, p: Vec2, hint: int | None = None) -> ProgressState:
    """Progress for a car spawned at ``p``.

    ``s`` starts at the spawn arc measured from the start line, taken in
    (−L/2, L/2]: a car spawned a little *behind* the line (a jittered start)
    gets a small negative ``s`` and must drive a genuine full lap to complete
    lap 1 — rather than reading as arc ≈ L and "completing" a lap on tick one.
    """
    arc, segment = arc_position(track, p, hint)
    if arc > track.total_length / 2:
        arc -= track.total_length
    return ProgressState(s=arc, segment=segment)


def update_progress(track: Track, prev: ProgressState, p: Vec2) -> tuple[ProgressState, float]:
    """Advance to the car's new position. Returns the new state and Δs (signed, m)."""
    L = track.total_length
    arc, segment = arc_position(track, p, prev.segment)
    delta = arc - (prev.s % L)
    if delta > L / 2:
        delta -= L
    elif delta <= -L / 2:
        delta += L
    return ProgressState(s=prev.s + delta, segment=segment), delta


def laps_completed(s: float, track: Track) -> int:
    """Forward crossings of the start line implied by ``s`` (never negative)."""
    return max(0, math.floor(s / track.total_length))
