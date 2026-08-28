"""Pick a run's competence checkpoint by evaluation, not recency.

    uv run python -m apex_trainer.debug.select_checkpoint runs/<id> [--every 250000]
        [--track track_a] [--episodes 5] [--top 5]

Every k-th checkpoint (plus the last) is evaluated with jittered starts;
ranking is by clean-lap rate, then crashes, then best lap. Prints a table and
the winner's step count on the last line (machine-readable: `best=<steps>`).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from apex_trainer.config import DEFAULT_EVAL_JITTER
from apex_trainer.evaluate import evaluate_checkpoint
from apex_trainer.runs import list_checkpoints, open_run


def sweep(
    run: Path, *, every: int, track: str | None, episodes: int, seed: int = 0
) -> list[tuple[int, float, int, float | None, str]]:
    paths = open_run(run)
    steps = [s for s, _ in list_checkpoints(paths)]
    picks = sorted({s for s in steps if s % every == 0} | {steps[-1]})
    rows = []
    for c in picks:
        _, stats, track_used = evaluate_checkpoint(
            paths,
            checkpoint_steps=c,
            track=track,
            episodes=episodes,
            seed=seed,
            jitter=DEFAULT_EVAL_JITTER,
        )
        attempted = sum(s.laps_attempted for s in stats)
        clean = sum(s.clean_laps for s in stats)
        crashes = sum(1 for s in stats if s.crashed)
        laps = [t for s in stats for t in s.lap_times]
        rate = clean / attempted if attempted else 0.0
        rows.append((c, rate, crashes, min(laps) if laps else None, track_used))
    return rows


def rank(
    rows: list[tuple[int, float, int, float | None, str]],
) -> list[tuple[int, float, int, float | None, str]]:
    return sorted(rows, key=lambda r: (-r[1], r[2], r[3] if r[3] is not None else 1e9, -r[0]))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("run", type=Path)
    p.add_argument("--every", type=int, default=250_000)
    p.add_argument("--track", default=None, help="default: the run's training track")
    p.add_argument("--episodes", type=int, default=5)
    p.add_argument("--top", type=int, default=5)
    args = p.parse_args(argv)
    rows = sweep(args.run, every=args.every, track=args.track, episodes=args.episodes)
    ranked = rank(rows)
    print(f"| ckpt | clean rate | crashes/{args.episodes} | best lap | track |")
    print("|---|---|---|---|---|")
    for c, rate, crashes, best, track in ranked[: args.top]:
        print(
            f"| {c / 1e6:.2f}M | {rate:.0%} | {crashes} | {best:.2f} s | {track} |"
            if best
            else f"| {c / 1e6:.2f}M | {rate:.0%} | {crashes} | — | {track} |"
        )
    print(f"best={ranked[0][0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
