"""Track geometry: a closed centerline polyline with uniform width, plus the
left/right edge polylines and arc-length tables derived from it.

Conventions (``apex_trainer.sim``): meters, x right, y up, travel direction =
centerline point order, loop closed implicitly (no duplicated vertex).

Segment ``i`` runs from ``centerline[i]`` to ``centerline[(i + 1) % n]``.
``left_edge[i]`` / ``right_edge[i]`` are ``centerline[i]`` offset by
``width / 2`` along the vertex's *mitered* normal, so both edges stay exactly
``width / 2`` from the two adjacent segments. The quad
``[L[i], L[i+1], R[i+1], R[i]]`` is the drivable region owned by segment ``i``;
consecutive quads share their mitered boundary, so together they tile the
track ring exactly — which is what makes containment and raycasts localizable
(see ``containment.py`` / ``raycast.py``).

This file does no IO. ``parse_track_data`` takes already-decoded JSON; loading
from disk lives in ``apex_trainer.tracks``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from apex_trainer.sim.geometry import Vec2, dot, left_normal, normalize, sub

# Reject vertex turns sharper than this (cos of half the turn angle): beyond it
# the width/2 offset edges would cross each other and the quads stop tiling.
MIN_MITER_COS_HALF = 0.1


class TrackFormatError(ValueError):
    """Raised for structurally invalid track data, with a human-readable reason."""


@dataclass(frozen=True)
class TrackData:
    """The hand-authored shape of a track file (tracks/README.md)."""

    name: str
    width: float
    centerline: tuple[Vec2, ...]


@dataclass(frozen=True)
class StartPose:
    x: float
    y: float
    heading: float
    """Heading of centerline segment 0, radians CCW from +x."""


@dataclass(frozen=True)
class Bounds:
    min_x: float
    min_y: float
    max_x: float
    max_y: float


@dataclass(frozen=True)
class Track:
    name: str
    width: float
    centerline: tuple[Vec2, ...]
    """n vertices."""
    directions: tuple[Vec2, ...]
    """Unit direction of segment i (centerline[i] → centerline[i+1])."""
    left_edge: tuple[Vec2, ...]
    """n left-edge vertices (car's left when driving in point order)."""
    right_edge: tuple[Vec2, ...]
    segment_lengths: tuple[float, ...]
    """Length of segment i, meters."""
    segment_start: tuple[float, ...]
    """Arc length from centerline[0] to centerline[i], meters (segment_start[0] = 0)."""
    total_length: float
    """Total centerline length L, meters."""
    start: StartPose
    bounds: Bounds
    """Axis-aligned bounds of the edges (for plots/renderers)."""

    @property
    def half_width(self) -> float:
        return self.width / 2.0


def segment_count(track: Track) -> int:
    """Number of segments (= number of vertices for a closed loop)."""
    return len(track.centerline)


def wrap_index(i: int, n: int) -> int:
    """Wrap a segment/vertex index into [0, n). Works for negative i."""
    return i % n


def parse_track_data(raw: object) -> TrackData:
    """Validate decoded JSON into :class:`TrackData`. Raises :class:`TrackFormatError`."""
    if not isinstance(raw, dict):
        raise TrackFormatError("track: not a JSON object")
    name = raw.get("name")
    width = raw.get("width")
    centerline = raw.get("centerline")
    if not isinstance(name, str) or not name:
        raise TrackFormatError("track: name must be a non-empty string")
    if isinstance(width, bool) or not isinstance(width, int | float) or not width > 0:
        raise TrackFormatError("track: width must be a positive number")
    if not isinstance(centerline, list):
        raise TrackFormatError("track: centerline must be an array")
    if len(centerline) < 3:
        raise TrackFormatError("track: centerline needs at least 3 points")
    points: list[Vec2] = []
    for i, p in enumerate(centerline):
        if not isinstance(p, list) or len(p) != 2:
            raise TrackFormatError(f"track: centerline[{i}] must be [x, y]")
        x, y = p
        for v in (x, y):
            if isinstance(v, bool) or not isinstance(v, int | float) or not math.isfinite(v):
                raise TrackFormatError(f"track: centerline[{i}] must be finite numbers")
        points.append((float(x), float(y)))
    return TrackData(name=name, width=float(width), centerline=tuple(points))


def build_track(data: TrackData) -> Track:
    """Derive edges, arc-length tables, start pose and bounds from track data."""
    n = len(data.centerline)
    if n < 3:
        raise TrackFormatError("track: centerline needs at least 3 points")
    c = data.centerline
    half = data.width / 2.0

    directions: list[Vec2] = []
    segment_lengths: list[float] = []
    for i in range(n):
        d = sub(c[(i + 1) % n], c[i])
        seg_len = math.hypot(d[0], d[1])
        if seg_len == 0.0:
            raise TrackFormatError(f"track: duplicate consecutive centerline points at {i}")
        directions.append((d[0] / seg_len, d[1] / seg_len))
        segment_lengths.append(seg_len)

    # Mitered offset at each vertex: bisector of the adjacent segments' left
    # normals, scaled so the offset point is exactly `half` from both segments.
    left_edge: list[Vec2] = []
    right_edge: list[Vec2] = []
    for i in range(n):
        n_prev = left_normal(directions[(i - 1) % n])
        n_next = left_normal(directions[i])
        bis = normalize((n_prev[0] + n_next[0], n_prev[1] + n_next[1]))
        cos_half = dot(bis, n_next)  # cos(turn/2); 1 on a straight
        if cos_half < MIN_MITER_COS_HALF:
            raise TrackFormatError(f"track: turn at vertex {i} is too sharp to offset")
        m = half / cos_half
        cx, cy = c[i]
        left_edge.append((cx + bis[0] * m, cy + bis[1] * m))
        right_edge.append((cx - bis[0] * m, cy - bis[1] * m))

    xs = [p[0] for p in left_edge + right_edge]
    ys = [p[1] for p in left_edge + right_edge]

    segment_start: list[float] = []
    acc = 0.0
    for seg_len in segment_lengths:
        segment_start.append(acc)
        acc += seg_len

    d0 = directions[0]
    return Track(
        name=data.name,
        width=data.width,
        centerline=tuple(c),
        directions=tuple(directions),
        left_edge=tuple(left_edge),
        right_edge=tuple(right_edge),
        segment_lengths=tuple(segment_lengths),
        segment_start=tuple(segment_start),
        total_length=acc,
        start=StartPose(x=c[0][0], y=c[0][1], heading=math.atan2(d0[1], d0[0])),
        bounds=Bounds(min_x=min(xs), min_y=min(ys), max_x=max(xs), max_y=max(ys)),
    )


def signed_area(track: Track) -> float:
    """Shoelace area of the centerline: positive = counter-clockwise loop (y-up)."""
    c = track.centerline
    n = len(c)
    return 0.5 * sum(c[i][0] * c[(i + 1) % n][1] - c[(i + 1) % n][0] * c[i][1] for i in range(n))
