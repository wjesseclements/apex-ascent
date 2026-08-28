"""Slice 6 results table: each run's latest checkpoint on every track, deterministic
(best lap) and jittered (clean-lap rate over N episodes), as Markdown.

    uv run python -m apex_trainer.debug.summarize_runs runs/<a> runs/<b> [--episodes 10]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from apex_trainer.config import DEFAULT_EVAL_JITTER
from apex_trainer.evaluate import evaluate_checkpoint
from apex_trainer.runs import latest_checkpoint, open_run
from apex_trainer.tracks import available_tracks


def cell_det(paths: Path, track: str) -> str:
    _, stats, _ = evaluate_checkpoint(
        open_run(paths), checkpoint_steps=None, track=track, episodes=1, seed=0
    )
    st = stats[0]
    if st.crashed:
        return f"crash @ {st.distance:.0f} m"
    best = st.best_lap
    return f"{st.laps} laps, best {best:.2f} s" if best else f"{st.distance:.0f} m, no lap"


def cell_jit(paths: Path, track: str, episodes: int) -> str:
    _, stats, _ = evaluate_checkpoint(
        open_run(paths),
        checkpoint_steps=None,
        track=track,
        episodes=episodes,
        seed=0,
        jitter=DEFAULT_EVAL_JITTER,
    )
    attempted = sum(s.laps_attempted for s in stats)
    clean = sum(s.clean_laps for s in stats)
    crashes = sum(1 for s in stats if s.crashed)
    laps = [t for s in stats for t in s.lap_times]
    best = f", best {min(laps):.2f} s" if laps else ""
    return f"{clean}/{attempted} clean, {crashes}/{episodes} crash{best}"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("runs", nargs="+", type=Path)
    p.add_argument("--episodes", type=int, default=10)
    p.add_argument("--tracks", default=",".join(available_tracks()))
    args = p.parse_args(argv)
    tracks = args.tracks.split(",")
    head = (
        "| run | steps | "
        + " | ".join(f"{t} det | {t} jitter×{args.episodes}" for t in tracks)
        + " |"
    )
    print(head)
    print("|" + "---|" * (2 + 2 * len(tracks)))
    for run in args.runs:
        paths = open_run(run)
        latest = latest_checkpoint(paths)
        steps = latest[0] if latest else 0
        cells = []
        for t in tracks:
            cells.append(cell_det(run, t))
            cells.append(cell_jit(run, t, args.episodes))
        print(f"| {paths.run_id} | {steps / 1e6:.2f}M | " + " | ".join(cells) + " |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
