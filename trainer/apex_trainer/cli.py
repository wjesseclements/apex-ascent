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


def build_train_parser() -> argparse.ArgumentParser:
    from pathlib import Path

    from apex_trainer.config import DEFAULT_TRAIN
    from apex_trainer.runs import DEFAULT_RUNS_DIR
    from apex_trainer.tracks import TRACK_A, available_tracks
    from apex_trainer.train import VEC_ENV_KINDS

    p = argparse.ArgumentParser(
        prog="train",
        description="Train PPO on ApexDrive-v0. --steps is a cumulative total: resuming a "
        "500k run with --steps 2000000 trains 1.5M more.",
    )
    p.add_argument(
        "--steps",
        type=int,
        required=True,
        help="total env steps to reach (rounded up to a full rollout of n_steps × n_envs)",
    )
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--track", default=TRACK_A, choices=available_tracks())
    p.add_argument(
        "--resume", type=Path, help="runs/<run_id> to continue (config from its snapshot)"
    )
    p.add_argument("--run-id", help="override the generated run id (new runs only)")
    p.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS_DIR)
    p.add_argument("--n-envs", type=int, default=DEFAULT_TRAIN.n_envs)
    p.add_argument("--vec-env", choices=VEC_ENV_KINDS, default=DEFAULT_TRAIN.vec_env)
    p.add_argument("--checkpoint-interval", type=int, default=DEFAULT_TRAIN.checkpoint_interval)
    return p


def train(argv: list[str] | None = None) -> int:
    """Train PPO (Slice 4)."""
    parser = build_train_parser()
    args = parser.parse_args(argv)
    from dataclasses import replace

    from apex_trainer.config import DEFAULT_TRAIN
    from apex_trainer.train import TrainArgs
    from apex_trainer.train import train as run_training

    train_cfg = replace(
        DEFAULT_TRAIN,
        n_envs=args.n_envs,
        vec_env=args.vec_env,
        checkpoint_interval=args.checkpoint_interval,
    )
    result = run_training(
        TrainArgs(
            steps=args.steps,
            seed=args.seed,
            track=args.track,
            runs_dir=args.runs_dir,
            run_id=args.run_id,
            resume=args.resume,
            train_cfg=train_cfg,
        )
    )
    trained = result.steps_after - result.steps_before
    print(
        f"run {result.paths.run_id}: {result.steps_before} → {result.steps_after} steps "
        f"({trained} this session) · {result.paths.root}"
    )
    if trained == 0:
        print(f"nothing to do: run already has ≥ {args.steps} steps", file=sys.stderr)
    return 0


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
