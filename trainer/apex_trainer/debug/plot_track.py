"""Debug plot: a track, the scripted driver's path coloured by speed, and the
ray fan at a chosen tick. The Slice 2 demo artefact.

    uv run python -m apex_trainer.debug.plot_track --track track_a --out ../docs/media/x.png

matplotlib is a dev dependency; nothing in ``sim/`` imports it.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

from apex_trainer.config import DEFAULT_SIM  # noqa: E402
from apex_trainer.debug.rollout import Sample, rollout_scripted  # noqa: E402
from apex_trainer.sim.track import Track  # noqa: E402
from apex_trainer.tracks import load_track  # noqa: E402

# Tokens borrowed from the app's palette so the two halves look related.
BG = "#0b0d12"
SURFACE = "#1c2130"
EDGE = "#8b95a8"
CENTER = "#2a3142"
ACCENT = "#ff4d1f"
RAY = "#4da3ff"
TEXT = "#e8ecf3"


def _closed(points: tuple[tuple[float, float], ...]) -> tuple[list[float], list[float]]:
    xs = [p[0] for p in points] + [points[0][0]]
    ys = [p[1] for p in points] + [points[0][1]]
    return xs, ys


def draw(track: Track, samples: list[Sample], ray_tick: int, title: str) -> Figure:
    fig, ax = plt.subplots(figsize=(11, 9), facecolor=BG)
    ax.set_facecolor(BG)

    lx, ly = _closed(track.left_edge)
    rx, ry = _closed(track.right_edge)
    ax.fill(lx, ly, color=SURFACE, zorder=0)
    ax.fill(rx, ry, color=BG, zorder=1)
    ax.plot(lx, ly, color=EDGE, lw=1.2, zorder=2)
    ax.plot(rx, ry, color=EDGE, lw=1.2, zorder=2)
    cx, cy = _closed(track.centerline)
    ax.plot(cx, cy, color=CENTER, lw=0.8, ls="--", zorder=2)

    # start line, perpendicular to segment 0
    d = track.directions[0]
    h = track.half_width
    ax.plot(
        [track.start.x - d[1] * h, track.start.x + d[1] * h],
        [track.start.y + d[0] * h, track.start.y - d[0] * h],
        color=TEXT,
        lw=2,
        zorder=3,
    )

    # path coloured by speed
    if len(samples) > 1:
        pts = [(s.x, s.y) for s in samples]
        segs = [[pts[i], pts[i + 1]] for i in range(len(pts) - 1)]
        speeds = [s.speed for s in samples[1:]]
        lc = LineCollection(segs, cmap="plasma", linewidths=2.2, zorder=4)
        lc.set_array(speeds)
        lc.set_clim(0, DEFAULT_SIM.physics.v_max)
        ax.add_collection(lc)
        cbar = fig.colorbar(lc, ax=ax, fraction=0.03, pad=0.02)
        cbar.set_label("speed (m/s)", color=TEXT)
        cbar.ax.yaxis.set_tick_params(color=TEXT, labelcolor=TEXT)

    # ray fan at one tick
    if samples:
        s = samples[min(ray_tick, len(samples)) - 1]
        for r in s.rays:
            ax.plot([s.x, r.x], [s.y, r.y], color=RAY, lw=0.9, alpha=0.9, zorder=5)
            if r.hit:
                ax.plot(r.x, r.y, "o", color=RAY, ms=3, zorder=6)
        ax.plot(s.x, s.y, "o", color=ACCENT, ms=7, zorder=7)
        ax.annotate(
            f"t = {s.tick / 60:.1f} s   v = {s.speed:.1f} m/s",
            (s.x, s.y),
            xytext=(10, 10),
            textcoords="offset points",
            color=TEXT,
            fontsize=9,
        )

    ax.set_aspect("equal")
    b = track.bounds
    ax.set_xlim(b.min_x - 8, b.max_x + 8)
    ax.set_ylim(b.min_y - 8, b.max_y + 8)
    ax.set_xlabel("x (m)  →", color=TEXT)
    ax.set_ylabel("y (m)  ↑", color=TEXT)
    ax.tick_params(colors=TEXT)
    for spine in ax.spines.values():
        spine.set_color(CENTER)
    ax.set_title(title, color=TEXT, loc="left", fontsize=12)
    fig.tight_layout()
    return fig


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", default="track_a")
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--ray-tick", type=int, default=420, help="tick at which to draw rays")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    track = load_track(args.track)
    samples, final = rollout_scripted(
        track, DEFAULT_SIM, int(args.seconds / DEFAULT_SIM.physics.dt)
    )
    laps = ", ".join(f"{t:.2f} s" for t in final.lap_times) or "none"
    status = "CRASHED" if final.crashed else "ok"
    title = (
        f"{track.name}: {track.total_length:.1f} m, width {track.width:.0f} m — scripted driver, "
        f"{args.seconds:.0f} s, laps: {laps} ({status})"
    )
    fig = draw(track, samples, args.ray_tick, title)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=110, facecolor=BG)
    print(f"wrote {args.out}  laps={final.laps} lap_times={list(final.lap_times)} {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
