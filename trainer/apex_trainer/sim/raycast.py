"""Raycasting against the track edges — exact and localized.

Uses the same per-segment drivable quads as ``containment.py``: the ray starts
inside the quad containing its origin and we repeatedly find the edge through
which it leaves the current quad. If that edge is a wall (left/right track
edge) the ray has hit; if it is the boundary shared with the next/previous
quad, the walk continues there. Cost is O(quads traversed) — a few per ray —
with no dependence on track size. The wall geometry is exactly the edges.

Max-range boundary (defined, not emergent): a hit is registered iff the wall
distance is STRICTLY less than ``max_range``. A wall at exactly ``max_range``
or beyond gives ``hit = False, distance = max_range``. Either way the
normalized reading is ``distance / max_range`` (Slice 3), so a wall at exactly
``max_range`` reads 1.0.

Conventions: ``apex_trainer.sim`` (x right, y up, directions unit length).
"""

from __future__ import annotations

from dataclasses import dataclass

from apex_trainer.sim.containment import point_in_segment_quad
from apex_trainer.sim.geometry import Vec2, from_angle
from apex_trainer.sim.track import Track, segment_count, wrap_index

# Tolerance for "same crossing distance" between a wall and a shared boundary, m.
# Ties resolve in favour of walls (a ray through a corner vertex touches the wall).
EPS = 1e-9
# A ray can never traverse more quads than the track has (guard against loops).
MAX_STEPS_FACTOR = 2

_EXIT_LEFT_WALL = 0
_EXIT_RIGHT_WALL = 1
_EXIT_FRONT = 2
_EXIT_BACK = 3


@dataclass(frozen=True)
class RayHit:
    distance: float
    """Distance travelled along the ray, m: the wall distance if hit, else max_range."""
    hit: bool
    """True iff a wall was struck strictly before max_range."""
    x: float
    y: float
    """Ray end point (the wall point if hit, else origin + dir·max_range)."""


def find_containing_quad(track: Track, p: Vec2, hint: int) -> int:
    """Index of the drivable quad containing ``p``, trying ``hint`` and its
    neighbours first, then a full scan. Returns −1 if ``p`` is off the surface."""
    n = segment_count(track)
    h = wrap_index(hint, n)
    if point_in_segment_quad(track, h, p):
        return h
    prev = wrap_index(h - 1, n)
    if point_in_segment_quad(track, prev, p):
        return prev
    nxt = (h + 1) % n
    if point_in_segment_quad(track, nxt, p):
        return nxt
    for i in range(n):
        if point_in_segment_quad(track, i, p):
            return i
    return -1


def _exit_t(
    ox: float, oy: float, dx: float, dy: float, a: Vec2, b: Vec2, cx: float, cy: float
) -> float:
    """Cyrus–Beck exit test for one edge a→b of a convex quad with interior point
    (cx, cy): if the ray o + d·t points OUT through the edge's line, return the t
    at which it crosses; otherwise +inf. Edges the ray enters through, or is
    parallel to, never count as exits — so a ray starting exactly on a shared
    boundary needs no special-casing."""
    nx = -(b[1] - a[1])
    ny = b[0] - a[0]
    if (cx - a[0]) * nx + (cy - a[1]) * ny > 0.0:  # flip to point away from the centre
        nx = -nx
        ny = -ny
    dn = dx * nx + dy * ny
    if dn <= 1e-12:
        return float("inf")
    return ((a[0] - ox) * nx + (a[1] - oy) * ny) / dn


def cast_ray(track: Track, origin: Vec2, direction: Vec2, max_range: float, hint: int) -> RayHit:
    """Cast a ray from ``origin`` along unit ``direction`` up to ``max_range``.

    ``hint`` is the segment nearest the origin (the car's progress segment).
    If the origin is not on the track surface the ray reports a hit at 0.
    """
    n = segment_count(track)
    q = find_containing_quad(track, origin, hint)
    if q < 0:
        return RayHit(distance=0.0, hit=True, x=origin[0], y=origin[1])

    ox, oy = origin
    dx, dy = direction
    t_cur = 0.0
    for _ in range(n * MAX_STEPS_FACTOR):
        j = (q + 1) % n
        l0 = track.left_edge[q]
        l1 = track.left_edge[j]
        r1 = track.right_edge[j]
        r0 = track.right_edge[q]
        cx = (l0[0] + l1[0] + r1[0] + r0[0]) / 4.0
        cy = (l0[1] + l1[1] + r1[1] + r0[1]) / 4.0

        t = _exit_t(ox, oy, dx, dy, l0, l1, cx, cy)
        exit_kind = _EXIT_LEFT_WALL
        t_right = _exit_t(ox, oy, dx, dy, r1, r0, cx, cy)
        if t_right < t:
            t = t_right
            exit_kind = _EXIT_RIGHT_WALL
        t_front = _exit_t(ox, oy, dx, dy, l1, r1, cx, cy)
        if t_front < t - EPS:
            t = t_front
            exit_kind = _EXIT_FRONT
        t_back = _exit_t(ox, oy, dx, dy, r0, l0, cx, cy)
        if t_back < t - EPS:
            t = t_back
            exit_kind = _EXIT_BACK

        if t == float("inf"):
            break  # numerically degenerate; treat as no hit in range
        if t < t_cur:
            t = t_cur  # never move backwards (rounding on a shared boundary)
        if t >= max_range:
            break
        if exit_kind in (_EXIT_LEFT_WALL, _EXIT_RIGHT_WALL):
            return RayHit(distance=t, hit=True, x=ox + dx * t, y=oy + dy * t)
        t_cur = t
        q = j if exit_kind == _EXIT_FRONT else wrap_index(q - 1, n)

    return RayHit(distance=max_range, hit=False, x=ox + dx * max_range, y=oy + dy * max_range)


def cast_fan(
    track: Track,
    origin: Vec2,
    heading: float,
    offsets: tuple[float, ...],
    max_range: float,
    hint: int,
) -> tuple[RayHit, ...]:
    """Cast one ray per offset (radians, CCW-positive relative to ``heading``)."""
    return tuple(
        cast_ray(track, origin, from_angle(heading + off), max_range, hint) for off in offsets
    )
