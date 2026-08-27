"""Console entry points declared in pyproject.toml.

``evaluate`` is real from Slice 3 (baseline policies); ``train`` and
``tensorboard`` land in Slice 4 and say so until then (exit status 2).
"""

from __future__ import annotations

import argparse
import sys

_NOT_YET = "{name}: not implemented until Slice {slice} (see SLICES.md)"


def _not_yet(name: str, slice_number: int) -> int:
    print(_NOT_YET.format(name=name, slice=slice_number), file=sys.stderr)
    return 2


def train() -> int:
    """Train PPO on the driving env; lands in Slice 4."""
    return _not_yet("train", 4)


def tensorboard() -> int:
    """Launch TensorBoard on the runs directory; lands in Slice 4."""
    return _not_yet("tensorboard", 4)


def build_evaluate_parser() -> argparse.ArgumentParser:
    from apex_trainer.policies import POLICY_NAMES
    from apex_trainer.tracks import TRACK_A, available_tracks

    p = argparse.ArgumentParser(
        prog="evaluate",
        description="Run a policy through ApexDrive-v0 episodes and report lap times, "
        "crash rate, return, distance and mean drive.",
    )
    p.add_argument(
        "run_dir",
        nargs="?",
        help="runs/<run_id> to evaluate a trained checkpoint (Slice 4)",
    )
    p.add_argument("--checkpoint", type=int, help="checkpoint step within run_dir (Slice 4)")
    p.add_argument("--policy", choices=POLICY_NAMES, help="baseline policy to evaluate")
    p.add_argument("--track", default=TRACK_A, choices=available_tracks())
    p.add_argument("--episodes", type=int, default=3)
    p.add_argument("--seed", type=int, default=0, help="episode i uses seed + i")
    p.add_argument("--max-steps", type=int, default=None, help="cap below the env's 3600")
    return p


def evaluate(argv: list[str] | None = None) -> int:
    """Evaluate a policy deterministically and report per-episode stats."""
    parser = build_evaluate_parser()
    args = parser.parse_args(argv)
    if args.run_dir is not None or args.checkpoint is not None:
        return _not_yet("evaluate runs/<run_id>", 4)
    if args.policy is None:
        parser.error("either runs/<run_id> or --policy is required")

    from apex_trainer.env import ApexDriveEnv
    from apex_trainer.evaluate import format_episode, format_summary, run_episode
    from apex_trainer.policies import make_policy

    env = ApexDriveEnv(args.track)
    policy = make_policy(args.policy)
    stats = []
    for i in range(args.episodes):
        st = run_episode(env, policy, seed=args.seed + i, max_steps=args.max_steps)
        stats.append(st)
        print(format_episode(i + 1, st))
    print(format_summary(args.policy, args.track, stats))
    return 0
