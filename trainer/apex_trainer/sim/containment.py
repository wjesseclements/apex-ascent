"""Is a point on the track surface? Exact, and localized.

Rather than a point-in-polygon test over the whole ring, find the centerline
segment nearest the query point — searching only a small window around a
caller-supplied hint (the segment found last tick) — then test the point
against that segment's drivable quad and its two neighbours. Because the
per-segment quads tile the ring exactly (``track.py``), this is exact, and
O(window) instead of O(n) per query once a hint is available.

Conventions: meters, x right, y up — see ``apex_trainer.sim``.
"""

from __future__ import annotations

from dataclasses import dataclass

from apex_trainer.sim.geometry import Vec2, point_segment
from apex_trainer.sim.track import Track, segment_count, wrap_index

# Segments either side of the hint to search before falling back to a full scan.
NEAREST_SEGMENT_WINDOW = 3

# A point exactly on a quad edge has a cross product of ±1e-15 rather than 0;
# without a tolerance a point on the boundary shared by two quads could be
# rejected by BOTH. Units are m² (cross-product units); 1e-9 m² is far below
# any physical scale here.
ON_EDGE_EPS = 1e-9


@dataclass(frozen=True)
class NearestSegment:
    index: int
    t: float
    """Parameter in [0, 1] of the closest point along that segment."""
    dist_sq: float


def nearest_segment(track: Track, p: Vec2, hint: int | None = None) -> NearestSegment:
    """Centerline segment nearest ``p``.

    With ``hint`` only segments within ±NEAREST_SEGMENT_WINDOW of it are
    examined; if the best candidate sits on the edge of that window the point
    may have moved further than expected (e.g. a reset), so fall back to a full
    scan to stay exact. Without a hint, all segments are scanned.
    """
    n = segment_count(track)
    if hint is not None and n > 2 * NEAREST_SEGMENT_WINDOW + 1:
        best = _scan(track, p, hint - NEAREST_SEGMENT_WINDOW, hint + NEAREST_SEGMENT_WINDOW)
        offset = wrap_index(best.index - hint + NEAREST_SEGMENT_WINDOW, n)
        if offset == 0 or offset == 2 * NEAREST_SEGMENT_WINDOW:
            best = _scan(track, p, 0, n - 1)
        return best
    return _scan(track, p, 0, n - 1)


def _scan(track: Track, p: Vec2, first: int, last: int) -> NearestSegment:
    n = segment_count(track)
    c = track.centerline
    best_index = wrap_index(first, n)
    best_t = 0.0
    best_dist_sq = float("inf")
    for k in range(first, last + 1):
        i = wrap_index(k, n)
        t, dist_sq = point_segment(p, c[i], c[(i + 1) % n])
        if dist_sq < best_dist_sq:
            best_dist_sq = dist_sq
            best_index = i
            best_t = t
    return NearestSegment(index=best_index, t=best_t, dist_sq=best_dist_sq)


def _side(a: Vec2, b: Vec2, p: Vec2) -> float:
    """Cross product (b − a) × (p − a): which side of line ab the point p is on."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def point_in_segment_quad(track: Track, i: int, p: Vec2) -> bool:
    """Is ``p`` inside the drivable quad owned by segment ``i``?

    The quad ``[L[i], L[i+1], R[i+1], R[i]]`` is convex for any well-formed
    track, so ``p`` is inside iff it lies on the same side of all four edges.
    The boundary counts as inside: a car exactly touching the wall is not yet
    dead.
    """
    n = segment_count(track)
    j = (i + 1) % n
    q0 = track.left_edge[i]
    q1 = track.left_edge[j]
    q2 = track.right_edge[j]
    q3 = track.right_edge[i]
    s0 = _side(q0, q1, p)
    s1 = _side(q1, q2, p)
    s2 = _side(q2, q3, p)
    s3 = _side(q3, q0, p)
    eps = ON_EDGE_EPS
    all_non_neg = s0 >= -eps and s1 >= -eps and s2 >= -eps and s3 >= -eps
    all_non_pos = s0 <= eps and s1 <= eps and s2 <= eps and s3 <= eps
    return all_non_neg or all_non_pos


@dataclass(frozen=True)
class InsideResult:
    inside: bool
    segment: int
    """Nearest segment index — pass back as ``hint`` next tick."""


def is_inside_track(track: Track, p: Vec2, hint: int | None = None) -> InsideResult:
    """Is ``p`` on the track surface? Exact with respect to the edges.

    Checks the nearest segment's quad and its two neighbours; a point in the
    ring always lies in one of those three.
    """
    n = segment_count(track)
    index = nearest_segment(track, p, hint).index
    inside = (
        point_in_segment_quad(track, index, p)
        or point_in_segment_quad(track, wrap_index(index - 1, n), p)
        or point_in_segment_quad(track, (index + 1) % n, p)
    )
    return InsideResult(inside=inside, segment=index)
