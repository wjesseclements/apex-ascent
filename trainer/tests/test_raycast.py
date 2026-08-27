"""Raycast sweeps over both real tracks."""

from __future__ import annotations

import math

import pytest

from apex_trainer.config import DEFAULT_RAYS
from apex_trainer.sim.containment import is_inside_track
from apex_trainer.sim.geometry import add, from_angle, scale
from apex_trainer.sim.raycast import RayHit, cast_fan, cast_ray, find_containing_quad
from apex_trainer.sim.track import Track, point_at_arc, segment_count

# Wall-hit distance tolerance, m: rays hit an exact line; 1e-6 covers rounding of the
# Cyrus–Beck parameter at ~100 m coordinates.
HIT_TOL = 1e-6
PROBE_M = 1e-3


def _midpoint(track: Track, i: int) -> tuple[tuple[float, float], float]:
    n = segment_count(track)
    a = track.centerline[i]
    b = track.centerline[(i + 1) % n]
    d = track.directions[i]
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), math.atan2(d[1], d[0])


def test_fan_offsets_are_evenly_spaced_right_to_left() -> None:
    offs = DEFAULT_RAYS.offsets()
    assert len(offs) == 12
    assert offs[0] == pytest.approx(-math.pi / 2)  # car's right
    assert offs[-1] == pytest.approx(math.pi / 2)  # car's left
    steps = {round(offs[i + 1] - offs[i], 12) for i in range(11)}
    assert len(steps) == 1
    assert offs == pytest.approx(tuple(-o for o in reversed(offs)))  # symmetric


def test_start_straight_of_track_a(track_a: Track) -> None:
    # Track A's first 80 m are a straight along +x. From x = 10 the wall ahead is
    # beyond 60 m (no hit at max range) but within 100 m (the first corner).
    origin = (10.0, 0.0)
    ahead = cast_ray(track_a, origin, from_angle(0.0), DEFAULT_RAYS.max_length, 0)
    assert ahead == RayHit(distance=60.0, hit=False, x=70.0, y=0.0)
    far = cast_ray(track_a, origin, from_angle(0.0), 100.0, 0)
    assert far.hit and 70.0 < far.distance < 100.0
    # Sideways: exactly half the width either way.
    for ang in (math.pi / 2, -math.pi / 2):
        side = cast_ray(track_a, origin, from_angle(ang), 60.0, 0)
        assert side.hit
        assert side.distance == pytest.approx(track_a.half_width, abs=HIT_TOL)


def test_perpendicular_rays_from_segment_midpoints_read_half_width(any_track: Track) -> None:
    half = any_track.half_width
    for i in range(segment_count(any_track)):
        p, heading = _midpoint(any_track, i)
        for ang in (heading + math.pi / 2, heading - math.pi / 2):
            hit = cast_ray(any_track, p, from_angle(ang), 60.0, i)
            assert hit.hit
            # Exactly half unless the ray exits through a mitered front/back boundary
            # first and meets the neighbouring quad's wall — never closer than half.
            assert hit.distance >= half - HIT_TOL, i
            assert hit.distance <= half / math.cos(math.radians(45)) + HIT_TOL, i


def test_every_fan_ray_ends_on_the_wall_or_at_max_range(any_track: Track) -> None:
    offs = DEFAULT_RAYS.offsets()
    rng = DEFAULT_RAYS.max_length
    for i in range(segment_count(any_track)):
        p, heading = _midpoint(any_track, i)
        for hit, off in zip(cast_fan(any_track, p, heading, offs, rng, i), offs, strict=True):
            assert 0.0 < hit.distance <= rng
            d = from_angle(heading + off)
            end = (hit.x, hit.y)
            assert end == pytest.approx(add(p, scale(d, hit.distance)))
            if hit.hit:
                assert hit.distance < rng
                assert is_inside_track(any_track, end, i).inside  # boundary is inclusive
                beyond = add(end, scale(d, PROBE_M))
                assert not is_inside_track(any_track, beyond, i).inside, (i, off)
            else:
                assert hit.distance == rng
                assert is_inside_track(any_track, end, i).inside


def test_ray_from_off_track_reports_zero(any_track: Track) -> None:
    b = any_track.bounds
    hit = cast_ray(any_track, (b.min_x - 5.0, b.min_y - 5.0), (1.0, 0.0), 60.0, 0)
    assert hit == RayHit(distance=0.0, hit=True, x=b.min_x - 5.0, y=b.min_y - 5.0)
    assert find_containing_quad(any_track, (b.min_x - 5.0, b.min_y - 5.0), 0) == -1


def test_hint_does_not_change_results(any_track: Track) -> None:
    n = segment_count(any_track)
    for i in range(0, n, 7):
        p, heading = _midpoint(any_track, i)
        for off in DEFAULT_RAYS.offsets():
            d = from_angle(heading + off)
            good = cast_ray(any_track, p, d, 60.0, i)
            stale = cast_ray(any_track, p, d, 60.0, (i + n // 2) % n)
            assert good == stale


def test_max_range_boundary_is_strict(track_a: Track) -> None:
    # Sideways from the centerline the wall is at exactly 6 m: a range of 6 m is a
    # miss (distance == range), a hair more is a hit at 6.
    p, _ = point_at_arc(track_a, 20.0)
    miss = cast_ray(track_a, p, from_angle(math.pi / 2), track_a.half_width, 0)
    assert not miss.hit and miss.distance == track_a.half_width
    hit = cast_ray(track_a, p, from_angle(math.pi / 2), track_a.half_width + 1e-6, 0)
    assert hit.hit and hit.distance == pytest.approx(track_a.half_width, abs=HIT_TOL)
