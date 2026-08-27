import math

import pytest

from apex_trainer.sim.geometry import (
    TAU,
    cross,
    from_angle,
    left_normal,
    normalize,
    point_segment,
    right_normal,
    wrap_angle,
)


class TestWrapAngle:
    def test_identity_inside_interval(self) -> None:
        for a in (0.0, 1.0, -1.0, math.pi):
            assert wrap_angle(a) == a

    def test_excluded_endpoint_maps_to_plus_pi(self) -> None:
        assert wrap_angle(-math.pi) == math.pi
        assert wrap_angle(-3 * math.pi) == math.pi
        assert wrap_angle(3 * math.pi) == math.pi

    def test_removes_whole_turns_and_normalizes_negative_zero(self) -> None:
        assert wrap_angle(TAU) == 0.0
        assert math.copysign(1.0, wrap_angle(-TAU)) == 1.0
        assert wrap_angle(1 + 5 * TAU) == pytest.approx(1.0, abs=1e-12)
        assert wrap_angle(-1 - 5 * TAU) == pytest.approx(-1.0, abs=1e-12)

    def test_property_sweep(self) -> None:
        # Deterministic sweep across ±100 turns; result in (-π, π], same direction.
        for i in range(-2000, 2001):
            theta = (i / 2000) * 100 * TAU + i * 1e-3
            a = wrap_angle(theta)
            assert -math.pi < a <= math.pi
            assert math.cos(a) == pytest.approx(math.cos(theta), abs=1e-9)
            assert math.sin(a) == pytest.approx(math.sin(theta), abs=1e-9)


def test_left_normal_is_ccw_rotation_in_y_up_frame() -> None:
    east = (1.0, 0.0)
    assert left_normal(east) == (0.0, 1.0)  # facing +x, left is +y (up)
    assert right_normal(east) == (0.0, -1.0)
    assert cross(east, left_normal(east)) > 0  # left is CCW of forward


def test_from_angle_is_ccw_from_plus_x() -> None:
    assert from_angle(0.0) == (1.0, 0.0)
    x, y = from_angle(math.pi / 2)
    assert (x, y) == pytest.approx((0.0, 1.0), abs=1e-12)


def test_normalize_rejects_zero() -> None:
    with pytest.raises(ValueError):
        normalize((0.0, 0.0))


def test_point_segment_clamps_to_endpoints() -> None:
    a, b = (0.0, 0.0), (10.0, 0.0)
    assert point_segment((5.0, 3.0), a, b) == (0.5, 9.0)
    assert point_segment((-5.0, 0.0), a, b) == (0.0, 25.0)
    assert point_segment((15.0, 0.0), a, b) == (1.0, 25.0)
    assert point_segment((3.0, 0.0), a, a) == (0.0, 9.0)  # degenerate segment
