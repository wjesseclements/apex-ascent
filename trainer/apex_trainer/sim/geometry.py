"""Small 2-D vector and angle helpers. Conventions: see ``apex_trainer.sim``.

Vectors are plain ``(x, y)`` tuples of floats — the hot loop runs one car per
environment, and plain tuples are both fast at that scale and trivially
portable to the TypeScript sim in Slice 8.
"""

from __future__ import annotations

import math

Vec2 = tuple[float, float]

TAU = 2.0 * math.pi


def wrap_angle(theta: float) -> float:
    """Wrap an angle into the half-open interval (-π, π] (SPEC §3.3).

    ``wrap_angle(-math.pi) == math.pi``; whole turns are removed; ``-0.0`` is
    normalized to ``0.0`` so zero has a single representation.
    """
    a = math.fmod(theta, TAU)  # (-TAU, TAU), sign of theta
    if a <= -math.pi:
        a += TAU
    elif a > math.pi:
        a -= TAU
    return 0.0 if a == 0.0 else a


def add(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] - b[0], a[1] - b[1])


def scale(a: Vec2, k: float) -> Vec2:
    return (a[0] * k, a[1] * k)


def dot(a: Vec2, b: Vec2) -> float:
    return a[0] * b[0] + a[1] * b[1]


def cross(a: Vec2, b: Vec2) -> float:
    """2-D cross product a × b (z component). Positive when b is CCW of a."""
    return a[0] * b[1] - a[1] * b[0]


def length(a: Vec2) -> float:
    return math.hypot(a[0], a[1])


def normalize(a: Vec2) -> Vec2:
    n = length(a)
    if n == 0.0:
        raise ValueError("cannot normalize a zero vector")
    return (a[0] / n, a[1] / n)


def from_angle(theta: float) -> Vec2:
    """Unit direction for heading θ (CCW from +x)."""
    return (math.cos(theta), math.sin(theta))


def left_normal(d: Vec2) -> Vec2:
    """Rotate +90° (CCW): the left of travel direction ``d`` in a y-up frame."""
    return (-d[1], d[0])


def right_normal(d: Vec2) -> Vec2:
    """Rotate -90° (CW): the right of travel direction ``d`` in a y-up frame."""
    return (d[1], -d[0])


def point_segment(p: Vec2, a: Vec2, b: Vec2) -> tuple[float, float]:
    """Closest point on segment a→b to p.

    Returns ``(t, dist_sq)``: the segment parameter ``t ∈ [0, 1]`` of the
    closest point and the squared distance to it.
    """
    abx = b[0] - a[0]
    aby = b[1] - a[1]
    apx = p[0] - a[0]
    apy = p[1] - a[1]
    len_sq = abx * abx + aby * aby
    t = 0.0 if len_sq == 0.0 else (apx * abx + apy * aby) / len_sq
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    dx = apx - abx * t
    dy = apy - aby * t
    return t, dx * dx + dy * dy
