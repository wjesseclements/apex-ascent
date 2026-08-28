"""Render a trajectory JSON to an animated GIF — track, trail, car and a g-g inset.

    uv run python -m apex_trainer.debug.render_gif ../app/public/gallery/e8/<file>.json \\
        --out ../docs/media/blog/e8a-brakes.gif --start 17.4 --seconds 17 --fps 20

Data-rendered (matplotlib), not screen-recorded: reproducible from the same
file, no browser needed. Colours borrow the app's tokens.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.animation import FuncAnimation, PillowWriter  # noqa: E402
from matplotlib.artist import Artist  # noqa: E402
from matplotlib.patches import Circle, Rectangle  # noqa: E402

from apex_trainer.debug.plot_track import BG, CENTER, EDGE, SURFACE, TEXT  # noqa: E402
from apex_trainer.tracks import load_track  # noqa: E402

ACCENT = "#ff4d1f"
THROTTLE = "#37d67a"
BRAKE = "#ff3b5c"
LATERAL = "#4da3ff"
A = 20.0
TRAIL_S = 2.0
CAR_L, CAR_W = 4.0, 1.8


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("trajectory", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--start", type=float, default=0.0, help="start time, s")
    p.add_argument("--seconds", type=float, default=20.0)
    p.add_argument("--fps", type=int, default=20)
    p.add_argument("--title", default="")
    args = p.parse_args(argv)

    doc = json.loads(args.trajectory.read_text(encoding="utf-8"))
    s = doc["samples"]
    dt = doc["meta"]["dt"]
    n = doc["meta"]["sampleCount"]
    track = load_track(doc["meta"]["trackId"])

    fig = plt.figure(figsize=(9, 6.5), facecolor=BG)
    ax = fig.add_axes((0.02, 0.02, 0.66, 0.96))
    gg = fig.add_axes((0.71, 0.36, 0.27, 0.36))
    for a in (ax, gg):
        a.set_facecolor(BG)
        a.set_xticks([])
        a.set_yticks([])
        for sp in a.spines.values():
            sp.set_visible(False)

    lx = [q[0] for q in track.left_edge] + [track.left_edge[0][0]]
    ly = [q[1] for q in track.left_edge] + [track.left_edge[0][1]]
    rx = [q[0] for q in track.right_edge] + [track.right_edge[0][0]]
    ry = [q[1] for q in track.right_edge] + [track.right_edge[0][1]]
    ax.fill(lx, ly, color=SURFACE, zorder=0)
    ax.fill(rx, ry, color=BG, zorder=1)
    ax.plot(lx, ly, color=EDGE, lw=1, zorder=2)
    ax.plot(rx, ry, color=EDGE, lw=1, zorder=2)
    cx = [q[0] for q in track.centerline] + [track.centerline[0][0]]
    cy = [q[1] for q in track.centerline] + [track.centerline[0][1]]
    ax.plot(cx, cy, color=CENTER, lw=0.6, ls="--", zorder=2)
    ax.set_aspect("equal")
    b = track.bounds
    ax.set_xlim(b.min_x - 6, b.max_x + 6)
    ax.set_ylim(b.min_y - 6, b.max_y + 6)
    ax.set_title(
        args.title or f"{doc['meta']['policy']} · {track.name}", color=TEXT, loc="left", fontsize=11
    )

    gg.add_patch(Circle((0, 0), A, fill=True, facecolor=SURFACE, edgecolor=EDGE, lw=1))
    gg.axhline(0, color=CENTER, lw=0.8)
    gg.axvline(0, color=CENTER, lw=0.8)
    gg.set_xlim(-A * 1.15, A * 1.15)
    gg.set_ylim(-A * 1.15, A * 1.15)
    gg.set_aspect("equal")
    gg.text(0, A * 1.02, "throttle", color=THROTTLE, ha="center", fontsize=8)
    gg.text(0, -A * 1.12, "brake", color=BRAKE, ha="center", fontsize=8)
    gg.set_title("g-g (a_lat, a_long)", color=TEXT, fontsize=9)
    (trace,) = gg.plot([], [], color=ACCENT, lw=1, alpha=0.7)
    (dot,) = gg.plot([], [], "o", color=ACCENT, ms=7)
    hud = fig.text(0.71, 0.24, "", color=TEXT, fontsize=10, family="monospace", va="top")

    trail_lines = [
        ax.plot([], [], lw=2.5, solid_capstyle="round", zorder=4)[0]
        for _ in range(int(TRAIL_S / dt))
    ]
    car = Rectangle((0, 0), CAR_L, CAR_W, color=ACCENT, zorder=6)
    ax.add_patch(car)

    i0 = int(args.start / dt)
    frames = int(args.seconds * args.fps)
    step = max(1, round(1 / (args.fps * dt)))

    def update(f: int) -> list[Artist]:
        i = min(n - 1, i0 + f * step)
        # trail
        start = max(0, i - len(trail_lines))
        for k, line in enumerate(trail_lines):
            j = start + k
            if j + 1 <= i:
                d = s["drive"][j]
                line.set_data([s["x"][j], s["x"][j + 1]], [s["y"][j], s["y"][j + 1]])
                line.set_color(BRAKE if d < -0.05 else THROTTLE if d > 0.05 else EDGE)
                line.set_alpha(0.15 + 0.85 * (k / len(trail_lines)))
            else:
                line.set_data([], [])
        # car
        h = s["heading"][i]
        cxp, cyp = s["x"][i], s["y"][i]
        car.set_xy(
            (
                cxp - (CAR_L / 2) * math.cos(h) + (CAR_W / 2) * math.sin(h),
                cyp - (CAR_L / 2) * math.sin(h) - (CAR_W / 2) * math.cos(h),
            )
        )
        car.set_angle(math.degrees(h))
        car.set_color(BRAKE if (doc["meta"]["crashed"] and i == n - 1) else ACCENT)
        # g-g
        j0 = max(0, i - int(TRAIL_S / dt))
        trace.set_data(s["aLat"][j0 : i + 1], s["aLong"][j0 : i + 1])
        dot.set_data([s["aLat"][i]], [s["aLong"][i]])
        dot.set_color(BRAKE if s["aLong"][i] < -2 and abs(s["aLat"][i]) > 4 else ACCENT)
        hud.set_text(
            f"t {s['t'][i]:5.1f} s\nv {s['speed'][i] * 3.6:5.0f} km/h\ndrive {s['drive'][i]:+.2f}\n"
            f"a_long {s['aLong'][i]:+5.1f}\na_lat  {s['aLat'][i]:+5.1f}"
        )
        return [car, trace, dot, hud, *trail_lines]

    anim = FuncAnimation(fig, update, frames=frames, interval=1000 / args.fps, blit=False)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    anim.save(
        str(args.out), writer=PillowWriter(fps=args.fps), dpi=80, savefig_kwargs={"facecolor": BG}
    )
    print(f"wrote {args.out} ({args.out.stat().st_size // 1024} KB, {frames} frames)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
