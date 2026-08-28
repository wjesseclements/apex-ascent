"""Multi-track training (Slice 6 E5): per-episode track sampling, seeded; single-track
configs are untouched."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from apex_trainer import cli
from apex_trainer.config import DEFAULT_TRAIN, TrainConfig
from apex_trainer.env import ApexDriveEnv
from apex_trainer.runs import read_config_snapshot
from apex_trainer.tracks import TRACK_A, TRACK_B


def test_single_track_env_is_unchanged() -> None:
    env = ApexDriveEnv(TRACK_A)
    assert [t.name for t in env.tracks] == [TRACK_A]
    env.reset(seed=0)
    assert env.track.name == TRACK_A
    assert DEFAULT_TRAIN.tracks == ("track_a",)


def test_multi_track_env_samples_per_episode_seeded() -> None:
    env = ApexDriveEnv((TRACK_A, "track_a_mirror", TRACK_B))
    seq = []
    env.reset(seed=42)
    for _ in range(30):
        obs, info = env.reset()
        assert info["track"] == env.track.name
        assert env.observation_space.contains(obs)
        seq.append(env.track.name)
    counts = Counter(seq)
    assert set(counts) == {TRACK_A, "track_a_mirror", TRACK_B}
    env2 = ApexDriveEnv((TRACK_A, "track_a_mirror", TRACK_B))
    env2.reset(seed=42)
    assert [env2.reset()[1]["track"] for _ in range(30)] == seq  # reproducible


def test_track_switch_resets_the_world_on_the_new_track() -> None:
    env = ApexDriveEnv((TRACK_A, TRACK_B))
    env.reset(seed=1)
    for _ in range(10):
        env.reset()
        # driving straight from the start is safe on every track for a few ticks
        for _ in range(30):
            obs, _r, terminated, _t, info = env.step(np.array([0.0, 1.0], dtype=np.float32))
            assert not terminated
        assert info["s"] > 1.0  # ~2 m/s start plus half a second of throttle


def test_empty_track_list_is_rejected() -> None:
    with pytest.raises(ValueError, match="at least one track"):
        ApexDriveEnv(())


def test_train_config_tracks_round_trip_and_legacy_snapshots() -> None:
    cfg = TrainConfig(tracks=("track_a", "track_a_mirror"))
    assert TrainConfig.from_dict(cfg.to_dict()) == cfg
    legacy = DEFAULT_TRAIN.to_dict()
    legacy.pop("tracks")
    assert TrainConfig.from_dict(legacy) == DEFAULT_TRAIN


def test_train_cli_experiment_overrides_land_in_the_snapshot(tmp_path: Path) -> None:
    assert (
        cli.train(
            [
                "--steps",
                "64",
                "--n-envs",
                "2",
                "--vec-env",
                "dummy",
                "--runs-dir",
                str(tmp_path),
                "--run-id",
                "x",
                "--tracks",
                "track_a,track_a_mirror",
                "--gamma",
                "0.995",
                "--ent-coef",
                "0.01",
                "--train-jitter",
            ]
        )
        == 0
    )
    snap = read_config_snapshot(
        __import__("apex_trainer.runs", fromlist=["open_run"]).open_run(tmp_path / "x")
    )
    assert snap["train"]["tracks"] == ["track_a", "track_a_mirror"]
    assert snap["track"] == "track_a"
    assert snap["ppo"]["gamma"] == 0.995 and snap["ppo"]["ent_coef"] == 0.01
    assert snap["env"]["episode"]["start_jitter"]["lateral"] == 1.5
