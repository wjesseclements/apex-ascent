"""SB3 smoke test (SPEC §10): a tiny PPO run in CI, and the run directory contract."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pytest
import torch

from apex_trainer.config import (
    DEFAULT_PPO,
    EnvConfig,
    EpisodeConfig,
    PPOConfig,
    TrainConfig,
    env_config_from_dict,
)
from apex_trainer.runs import (
    RESUME_NOTE,
    list_checkpoints,
    make_run_id,
    open_run,
    read_config_snapshot,
    read_metadata,
)
from apex_trainer.seeding import seed_everything
from apex_trainer.train import TrainArgs, train

# Smoke config: tiny rollouts so 256 steps produce updates, checkpoints and finished
# episodes (episodes capped at 40 ticks so the untrained, dithering policy still ends
# some). Not a training config — a plumbing test.
SMOKE_PPO = PPOConfig(n_steps=32, batch_size=16, n_epochs=1)
SMOKE_TRAIN = TrainConfig(n_envs=2, vec_env="dummy", checkpoint_interval=128)
SMOKE_ENV = EnvConfig(episode=EpisodeConfig(max_steps=40))
SMOKE_STEPS = 256


def _smoke_args(runs_dir: Path, run_id: str, **overrides: object) -> TrainArgs:
    base = dict(
        steps=SMOKE_STEPS,
        seed=3,
        runs_dir=runs_dir,
        run_id=run_id,
        env_cfg=SMOKE_ENV,
        ppo_cfg=SMOKE_PPO,
        train_cfg=SMOKE_TRAIN,
        log_stdout=False,
    )
    base.update(overrides)
    return TrainArgs(**base)  # type: ignore[arg-type]


def test_smoke_run_directory_contract(tmp_path: Path) -> None:
    result = train(_smoke_args(tmp_path, "smoke"))
    paths = result.paths
    assert result.steps_before == 0 and result.steps_after == SMOKE_STEPS

    # config snapshot round-trips into the exact configs used
    snap = read_config_snapshot(paths)
    assert snap["track"] == "track_a" and snap["seed"] == 3
    assert env_config_from_dict(snap["env"]) == SMOKE_ENV
    assert PPOConfig.from_dict(snap["ppo"]) == SMOKE_PPO
    assert TrainConfig.from_dict(snap["train"]) == SMOKE_TRAIN
    assert snap["env"]["observation"]["version"] == "v0"

    # metadata: seed, versions, git sha, one session, the resume note
    meta = read_metadata(paths)
    assert meta["seed"] == 3 and meta["run_id"] == "smoke"
    assert {"python", "torch", "stable_baselines3", "gymnasium", "numpy"} <= meta["versions"].keys()
    assert "git_sha" in meta
    assert len(meta["sessions"]) == 1
    assert meta["sessions"][0]["final_steps"] == SMOKE_STEPS
    assert meta["sessions"][0]["resumed_from_steps"] is None
    assert RESUME_NOTE in meta["notes"]

    # checkpoints every 128 env steps (2 envs × 64 calls) plus the final save
    steps = [s for s, _ in list_checkpoints(paths)]
    assert steps == [128, 256]

    # TensorBoard events and progress.csv with SB3's and our metrics
    assert list(paths.tb_dir.glob("events.out.tfevents.*"))
    with (paths.tb_dir / "progress.csv").open() as f:
        rows = list(csv.DictReader(f))
    assert rows
    cols = set(rows[0].keys())
    assert {"rollout/ep_rew_mean", "train/policy_gradient_loss", "time/total_timesteps"} <= cols
    assert {"rollout/crash_rate", "rollout/distance_mean", "rollout/mean_drive"} <= cols
    assert open_run(paths.root) == paths


def test_run_id_format() -> None:
    from datetime import UTC, datetime

    rid = make_run_id("track_b", 7, datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC))
    assert rid == "20260827-120000-track_b-s7"


def test_seed_everything_pins_all_rngs() -> None:
    seed_everything(11)
    a = (np.random.rand(3), torch.rand(3), __import__("random").random())
    seed_everything(11)
    b = (np.random.rand(3), torch.rand(3), __import__("random").random())
    assert np.array_equal(a[0], b[0]) and torch.equal(a[1], b[1]) and a[2] == b[2]
    assert torch.get_num_threads() == 1
    assert torch.are_deterministic_algorithms_enabled()


def test_same_seed_twice_gives_identical_weights(tmp_path: Path) -> None:
    from stable_baselines3 import PPO

    r1 = train(_smoke_args(tmp_path, "a"))
    r2 = train(_smoke_args(tmp_path, "b"))
    p1 = PPO.load(list_checkpoints(r1.paths)[-1][1], device="cpu").policy.state_dict()
    p2 = PPO.load(list_checkpoints(r2.paths)[-1][1], device="cpu").policy.state_dict()
    for k in p1:
        assert torch.equal(p1[k], p2[k]), k


def test_defaults_are_sb3_defaults_except_recorded_deviations() -> None:
    from stable_baselines3 import PPO

    from apex_trainer.env import ApexDriveEnv

    model = PPO("MlpPolicy", ApexDriveEnv(), device="cpu")
    for name in (
        "learning_rate",
        "n_steps",
        "batch_size",
        "n_epochs",
        "gamma",
        "gae_lambda",
        "ent_coef",
        "vf_coef",
        "max_grad_norm",
    ):
        assert getattr(DEFAULT_PPO, name) == getattr(model, name), name
    assert DEFAULT_PPO.clip_range == 0.2  # SB3 default (stored as a schedule on the model)


def test_existing_run_dir_is_never_overwritten(tmp_path: Path) -> None:
    train(_smoke_args(tmp_path, "dup", steps=64))
    with pytest.raises(FileExistsError):
        train(_smoke_args(tmp_path, "dup", steps=64))


def test_config_snapshot_is_valid_json_with_reasons_in_code(tmp_path: Path) -> None:
    r = train(_smoke_args(tmp_path, "j", steps=64))
    data = json.loads(r.paths.config_json.read_text())
    assert data["ppo"]["device"] == "cpu" and data["ppo"]["torch_threads"] == 1
