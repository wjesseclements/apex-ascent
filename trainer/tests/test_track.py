"""Track format + derived geometry, swept over the real tracks."""

from __future__ import annotations

import math

import pytest

from apex_trainer.sim.geometry import cross, dot, sub
from apex_trainer.sim.track import (
    Track,
    TrackFormatError,
    build_track,
    parse_track_data,
    segment_count,
    signed_area,
)
from apex_trainer.tracks import available_tracks, load_track

# Pinned centerline lengths (m). Computed from the committed JSON; a change means the
# track data changed, which must be deliberate. Tolerance covers summation order only.
PINNED_LENGTH = {"track_a": 439.631, "track_b": 509.057}
LENGTH_TOL = 0.001

# Distance-from-segment assertions: mitered offsets are exact up to float rounding
# over ~100 m coordinates, so 1e-9 m is a rounding budget, not a geometric slack.
GEOM_TOL = 1e-9


def _dist_to_segment_line(p: tuple[float, float], track: Track, i: int) -> float:
    """Perpendicular distance from p to the infinite line through segment i."""
    n = segment_count(track)
    a = track.centerline[i]
    d = track.directions[i]
    assert track.centerline[(i + 1) % n] != a
    return abs(cross(d, sub(p, a)))


def test_both_tracks_are_available() -> None:
    assert available_tracks() == ["track_a", "track_b"]


def test_pinned_lengths(any_track: Track) -> None:
    assert any_track.total_length == pytest.approx(PINNED_LENGTH[any_track.name], abs=LENGTH_TOL)
    assert any_track.width == 12.0


def test_frame_conversion_preserved_handedness(track_a: Track, track_b: Track) -> None:
    # apex-evolve: Track A is driven clockwise (right-handers), Track B counter-
    # clockwise. In a y-up frame, clockwise = negative shoelace area.
    assert signed_area(track_a) < 0
    assert signed_area(track_b) > 0


def test_start_pose_on_the_start_line_facing_plus_x(any_track: Track) -> None:
    assert (any_track.start.x, any_track.start.y) == (0.0, 0.0)
    assert any_track.start.heading == 0.0


def test_arc_length_tables(any_track: Track) -> None:
    n = segment_count(any_track)
    assert len(any_track.segment_start) == n == len(any_track.segment_lengths)
    assert any_track.segment_start[0] == 0.0
    for i in range(1, n):
        assert any_track.segment_start[i] > any_track.segment_start[i - 1]
        assert any_track.segment_start[i] == pytest.approx(
            any_track.segment_start[i - 1] + any_track.segment_lengths[i - 1]
        )
    assert sum(any_track.segment_lengths) == pytest.approx(any_track.total_length)
    assert all(seg_len > 0 for seg_len in any_track.segment_lengths)


def test_directions_are_unit(any_track: Track) -> None:
    for d in any_track.directions:
        assert math.hypot(*d) == pytest.approx(1.0, abs=1e-12)


def test_edges_are_half_width_from_both_adjacent_segments(any_track: Track) -> None:
    n = segment_count(any_track)
    half = any_track.half_width
    for i in range(n):
        for edge in (any_track.left_edge, any_track.right_edge):
            p = edge[i]
            assert _dist_to_segment_line(p, any_track, i) == pytest.approx(half, abs=GEOM_TOL)
            assert _dist_to_segment_line(p, any_track, (i - 1) % n) == pytest.approx(
                half, abs=GEOM_TOL
            )


def test_left_edge_is_on_the_left(any_track: Track) -> None:
    for i in range(segment_count(any_track)):
        c = any_track.centerline[i]
        d = any_track.directions[i]
        assert cross(d, sub(any_track.left_edge[i], c)) > 0
        assert cross(d, sub(any_track.right_edge[i], c)) < 0
        # and the offset is not "backwards" along the segment
        assert abs(dot(d, sub(any_track.left_edge[i], c))) < any_track.width


def test_bounds_contain_all_edge_points(any_track: Track) -> None:
    b = any_track.bounds
    for p in any_track.left_edge + any_track.right_edge:
        assert b.min_x <= p[0] <= b.max_x
        assert b.min_y <= p[1] <= b.max_y


class TestParseTrackData:
    def test_round_trip_of_committed_files(self) -> None:
        for name in available_tracks():
            assert load_track(name).name == name

    @pytest.mark.parametrize(
        "raw, message",
        [
            ([], "not a JSON object"),
            ({"width": 12, "centerline": [[0, 0], [1, 0], [1, 1]]}, "name"),
            ({"name": "t", "width": 0, "centerline": [[0, 0], [1, 0], [1, 1]]}, "width"),
            ({"name": "t", "width": True, "centerline": [[0, 0], [1, 0], [1, 1]]}, "width"),
            ({"name": "t", "width": 12, "centerline": "nope"}, "must be an array"),
            ({"name": "t", "width": 12, "centerline": [[0, 0], [1, 0]]}, "at least 3"),
            ({"name": "t", "width": 12, "centerline": [[0, 0], [1], [1, 1]]}, r"centerline\[1\]"),
            ({"name": "t", "width": 12, "centerline": [[0, 0], [1, "x"], [1, 1]]}, "finite"),
        ],
    )
    def test_rejects_malformed(self, raw: object, message: str) -> None:
        with pytest.raises(TrackFormatError, match=message):
            parse_track_data(raw)

    def test_build_rejects_duplicate_consecutive_points(self) -> None:
        data = parse_track_data(
            {"name": "t", "width": 2, "centerline": [[0, 0], [10, 0], [10, 0], [10, 10]]}
        )
        with pytest.raises(TrackFormatError, match="duplicate"):
            build_track(data)

    def test_build_rejects_hairpin_too_sharp_to_offset(self) -> None:
        data = parse_track_data(
            {"name": "t", "width": 2, "centerline": [[0, 0], [10, 0], [0, 0.01], [-10, 5]]}
        )
        with pytest.raises(TrackFormatError, match="too sharp"):
            build_track(data)


def test_square_track_edges_are_exact() -> None:
    # A 100 m square driven CCW: left edge is the inner square (y-up frame).
    data = parse_track_data(
        {"name": "sq", "width": 10, "centerline": [[0, 0], [100, 0], [100, 100], [0, 100]]}
    )
    t = build_track(data)
    assert t.total_length == 400.0
    assert signed_area(t) > 0
    assert t.left_edge[0] == pytest.approx((5.0, 5.0))
    assert t.right_edge[0] == pytest.approx((-5.0, -5.0))
    assert t.left_edge[2] == pytest.approx((95.0, 95.0))
