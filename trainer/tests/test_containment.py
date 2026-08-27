"""Containment sweeps over the real tracks: inside ⇔ within width/2 of the ring."""

from __future__ import annotations

from apex_trainer.sim.containment import (
    NEAREST_SEGMENT_WINDOW,
    InsideResult,
    is_inside_track,
    nearest_segment,
    point_in_segment_quad,
)
from apex_trainer.sim.geometry import Vec2, add, left_normal, right_normal, scale
from apex_trainer.sim.track import Track, segment_count

# How far inside / outside the edge the probe points sit. 1 mm is far above float
# noise at 100 m scale and far below any physical feature of the track.
PROBE_M = 1e-3


def _along(track: Track, i: int, frac: float) -> tuple[Vec2, Vec2]:
    """Point at `frac` along segment i and that segment's unit direction."""
    n = segment_count(track)
    a = track.centerline[i]
    b = track.centerline[(i + 1) % n]
    return (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac), track.directions[i]


def test_centerline_vertices_and_midpoints_are_inside(any_track: Track) -> None:
    for i in range(segment_count(any_track)):
        assert is_inside_track(any_track, any_track.centerline[i]).inside
        mid, _ = _along(any_track, i, 0.5)
        assert is_inside_track(any_track, mid).inside


def test_just_inside_edges_is_inside_and_just_outside_is_outside(any_track: Track) -> None:
    half = any_track.half_width
    for i in range(segment_count(any_track)):
        for frac in (0.25, 0.5, 0.75):
            p, d = _along(any_track, i, frac)
            for normal in (left_normal(d), right_normal(d)):
                inside_pt = add(p, scale(normal, half - PROBE_M))
                outside_pt = add(p, scale(normal, half + PROBE_M))
                assert is_inside_track(any_track, inside_pt).inside, (i, frac)
                assert not is_inside_track(any_track, outside_pt).inside, (i, frac)


def test_edge_vertices_count_as_inside(any_track: Track) -> None:
    # Boundary is inclusive: touching the wall is not yet a crash.
    for p in any_track.left_edge + any_track.right_edge:
        assert is_inside_track(any_track, p).inside


def test_far_points_are_outside(any_track: Track) -> None:
    b = any_track.bounds
    for p in (
        (b.min_x - 1.0, b.min_y - 1.0),
        (b.max_x + 1.0, b.max_y + 1.0),
        (b.min_x - 1.0, b.max_y + 1.0),
        ((b.min_x + b.max_x) / 2, (b.min_y + b.max_y) / 2),  # infield centre of the loop
    ):
        assert not is_inside_track(any_track, p).inside


def test_hinted_search_matches_full_scan_along_a_lap(any_track: Track) -> None:
    # Probe points sit strictly inside segments: at a vertex both adjacent segments
    # are at distance 0 and the tie can legitimately resolve either way.
    hint = 0
    for i in range(segment_count(any_track)):
        for frac in (0.1, 0.3, 0.6, 0.9):
            p, _ = _along(any_track, i, frac)
            full = nearest_segment(any_track, p)
            hinted = nearest_segment(any_track, p, hint)
            assert hinted.index == full.index
            assert hinted.dist_sq == full.dist_sq
            hint = hinted.index


def test_hinted_search_recovers_from_a_stale_hint(any_track: Track) -> None:
    # A "reset" to the far side of the track with a hint from the old position.
    n = segment_count(any_track)
    far = any_track.centerline[n // 2]
    stale_hint = 0
    assert n // 2 > 2 * NEAREST_SEGMENT_WINDOW + 1
    assert (
        nearest_segment(any_track, far, stale_hint).index == nearest_segment(any_track, far).index
    )


def test_every_ring_point_is_in_exactly_one_or_two_quads(any_track: Track) -> None:
    # Quads tile the ring: interior points are in exactly one quad; points on a shared
    # boundary in two. Never zero (the bug ON_EDGE_EPS exists for), never three.
    n = segment_count(any_track)
    for i in range(n):
        p, _ = _along(any_track, i, 0.5)
        count = sum(point_in_segment_quad(any_track, j, p) for j in range(n))
        assert count == 1, (i, count)
        v = any_track.centerline[i]
        count = sum(point_in_segment_quad(any_track, j, v) for j in range(n))
        assert count == 2, (i, count)


def test_inside_result_reports_nearest_segment(any_track: Track) -> None:
    res = is_inside_track(any_track, any_track.centerline[7])
    assert isinstance(res, InsideResult)
    assert res.segment in (6, 7)
