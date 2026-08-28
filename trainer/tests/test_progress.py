"""Progress sweeps: monotone modulo wrap for forward paths on both real tracks."""

from __future__ import annotations

import math

import pytest

from apex_trainer.config import DEFAULT_PHYSICS as CFG
from apex_trainer.sim.progress import (
    arc_position,
    initial_progress,
    laps_completed,
    update_progress,
)
from apex_trainer.sim.track import (
    Track,
    TrackData,
    build_track,
    parse_track_data,
    point_at_arc,
)

# Δs for a point moving exactly along the centerline equals the arc step up to float
# rounding of the projection at ~100 m coordinates; 1e-6 m is a rounding budget.
DELTA_TOL = 1e-6
STEP_M = 25.0 * CFG.dt  # a competent lap's per-tick distance (~0.417 m, SPEC §5)


def test_initial_progress_on_the_start_line_is_zero(any_track: Track) -> None:
    st = initial_progress(any_track, (any_track.start.x, any_track.start.y))
    assert st.s == 0.0


def test_point_at_arc_round_trips_through_arc_position(any_track: Track) -> None:
    L = any_track.total_length
    for k in range(0, 400):
        s = k * L / 400
        p, _ = point_at_arc(any_track, s)
        arc, _ = arc_position(any_track, p)
        assert arc == pytest.approx(s, abs=DELTA_TOL)


def test_driving_the_centerline_forward_is_monotone_with_exact_deltas(any_track: Track) -> None:
    L = any_track.total_length
    st = initial_progress(any_track, (any_track.start.x, any_track.start.y))
    steps = int(1.2 * L / STEP_M)  # a lap and a bit: exercises the wrap at L
    for k in range(1, steps + 1):
        p, _ = point_at_arc(any_track, k * STEP_M)
        st, delta = update_progress(any_track, st, p)
        assert delta == pytest.approx(STEP_M, abs=DELTA_TOL)
        assert st.s == pytest.approx(k * STEP_M, abs=k * DELTA_TOL)
    assert st.s > L
    assert laps_completed(st.s, any_track) == 1


def test_driving_backwards_loses_progress(any_track: Track) -> None:
    st = initial_progress(any_track, point_at_arc(any_track, 100.0)[0])
    for k in range(1, 50):
        p, _ = point_at_arc(any_track, 100.0 - k * STEP_M)
        st, delta = update_progress(any_track, st, p)
        assert delta == pytest.approx(-STEP_M, abs=DELTA_TOL)
    assert laps_completed(st.s, any_track) == 0
    # ... and crossing the start line backwards never yields a lap
    st = initial_progress(any_track, (any_track.start.x, any_track.start.y))
    st, delta = update_progress(any_track, st, point_at_arc(any_track, -1.0)[0])
    assert delta == pytest.approx(-1.0, abs=DELTA_TOL)
    assert st.s < 0
    assert laps_completed(st.s, any_track) == 0


def test_offset_line_is_still_monotone(any_track: Track) -> None:
    # A continuous path 4 m left of the centerline (the mitered offset polyline, i.e.
    # a scaled-down left edge): Δs varies with curvature but never reverses. It can be
    # exactly 0 for a tick on the inside of a corner, where consecutive samples both
    # project onto the vertex — "monotone" for a projection metric is non-decreasing.
    # (Offsetting each segment by its own normal instead would self-overlap at inside
    # corners and genuinely move backwards — not a path a car can drive.)
    k = 4.0 / any_track.half_width
    offset_vertices = tuple(
        (c[0] + (e[0] - c[0]) * k, c[1] + (e[1] - c[1]) * k)
        for c, e in zip(any_track.centerline, any_track.left_edge, strict=True)
    )
    path = build_track(TrackData(name="offset", width=1.0, centerline=offset_vertices))

    # Step the path in N equal pieces so it returns exactly to its start: projection
    # is a pure function of position, so s must then have advanced by exactly L.
    # Start half a piece in: the path's vertex 0 is the mitered offset of the track's
    # vertex 0 and therefore EXACTLY equidistant from segments 0 and n-1 — a tie the
    # hinted and full scans resolve differently (found on track_a_mirror).
    n_steps = math.ceil(path.total_length / STEP_M)
    piece = path.total_length / n_steps
    phase = piece / 2
    st = initial_progress(any_track, point_at_arc(path, phase)[0])
    s0 = st.s
    for k_step in range(1, n_steps + 1):
        st, delta = update_progress(any_track, st, point_at_arc(path, phase + k_step * piece)[0])
        assert delta >= -DELTA_TOL, k_step  # 0 at a plateau, up to rounding
    assert st.s - s0 == pytest.approx(any_track.total_length, abs=DELTA_TOL)


def test_half_lap_wrap_guard_on_a_square() -> None:
    # 400 m square: a jump of exactly L/2 + ε forward is read as a jump backwards
    # (the guard), a jump of L/2 exactly as forward — the interval is (−L/2, L/2].
    t = build_track(
        parse_track_data(
            {"name": "sq", "width": 10, "centerline": [[0, 0], [100, 0], [100, 100], [0, 100]]}
        )
    )
    st = initial_progress(t, (0.0, 0.0))
    _, delta = update_progress(t, st, point_at_arc(t, 200.0)[0])
    assert delta == pytest.approx(200.0)
    _, delta = update_progress(t, st, point_at_arc(t, 200.5)[0])
    assert delta == pytest.approx(-199.5)


def test_laps_completed_is_floor_and_never_negative(track_a: Track) -> None:
    L = track_a.total_length
    assert laps_completed(-5.0, track_a) == 0
    assert laps_completed(L - 1e-9, track_a) == 0
    assert laps_completed(L, track_a) == 1
    assert laps_completed(2.5 * L, track_a) == 2
    assert math.isclose(L, 439.631, abs_tol=1e-3)
