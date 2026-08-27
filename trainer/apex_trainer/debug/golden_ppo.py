"""Golden pin for the training/evaluation pipeline: a tiny PPO checkpoint
trained with the smoke config, plus pinned evaluation aggregates.

    uv run python -m apex_trainer.debug.golden_ppo --write   # regenerate (deliberately!)

What the pin claims (approved scope): loading this checkpoint and evaluating it
deterministically reproduces these aggregate stats within stated tolerances —
NOT a bit-exact trajectory across machines (SPEC §9 declines that claim).
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from apex_trainer.config import EnvConfig, EpisodeConfig, PPOConfig, TrainConfig
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import run_episode, stats_to_dict
from apex_trainer.policies import CheckpointPolicy
from apex_trainer.runs import list_checkpoints
from apex_trainer.tracks import TRACK_A
from apex_trainer.train import TrainArgs, train

GOLDEN_DIR = Path(__file__).resolve().parents[2] / "tests" / "golden"
GOLDEN_CHECKPOINT = GOLDEN_DIR / "ppo_tiny.zip"
GOLDEN_STATS = GOLDEN_DIR / "ppo_tiny_eval.json"

# Training recipe for the pinned checkpoint (a plumbing artefact, not a driver).
GOLDEN_SEED = 3
GOLDEN_STEPS = 1024
GOLDEN_PPO = PPOConfig(n_steps=64, batch_size=32, n_epochs=2)
GOLDEN_TRAIN = TrainConfig(n_envs=2, vec_env="dummy", checkpoint_interval=1024)
# Evaluation recipe (episodes capped so the pin runs in a second or two in CI).
EVAL_EPISODES = 2
EVAL_SEED = 0
EVAL_MAX_STEPS = 600
EVAL_ENV = EnvConfig(episode=EpisodeConfig(max_steps=EVAL_MAX_STEPS))


def evaluate_golden(checkpoint: Path) -> list[dict[str, Any]]:
    env = ApexDriveEnv(TRACK_A, EVAL_ENV)
    policy = CheckpointPolicy(checkpoint, name="ppo_tiny")
    return [
        stats_to_dict(run_episode(env, policy, seed=EVAL_SEED + i, max_steps=EVAL_MAX_STEPS))
        for i in range(EVAL_EPISODES)
    ]


def make_golden(write: bool) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        result = train(
            TrainArgs(
                steps=GOLDEN_STEPS,
                seed=GOLDEN_SEED,
                track=TRACK_A,
                runs_dir=Path(tmp),
                run_id="golden",
                ppo_cfg=GOLDEN_PPO,
                train_cfg=GOLDEN_TRAIN,
                log_stdout=False,
            )
        )
        ckpt = list_checkpoints(result.paths)[-1][1]
        if write:
            shutil.copyfile(ckpt, GOLDEN_CHECKPOINT)
        episodes = evaluate_golden(ckpt)
    data = {
        "recipe": {
            "seed": GOLDEN_SEED,
            "steps": GOLDEN_STEPS,
            "ppo": GOLDEN_PPO.to_dict(),
            "train": GOLDEN_TRAIN.to_dict(),
            "eval_episodes": EVAL_EPISODES,
            "eval_seed": EVAL_SEED,
            "eval_max_steps": EVAL_MAX_STEPS,
        },
        "episodes": episodes,
    }
    if write:
        GOLDEN_STATS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--write", action="store_true", help="overwrite the committed pin")
    args = p.parse_args(argv)
    data = make_golden(write=args.write)
    print(json.dumps(data["episodes"], indent=2))
    if args.write:
        print(
            f"wrote {GOLDEN_CHECKPOINT} ({GOLDEN_CHECKPOINT.stat().st_size} bytes), {GOLDEN_STATS}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
