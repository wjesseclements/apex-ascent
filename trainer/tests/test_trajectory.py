"""Trajectory export validates against the app-generated JSON Schema (SPEC §2/§7)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import jsonschema
import pytest

from apex_trainer import cli
from apex_trainer.config import DEFAULT_ENV, DEFAULT_SIM, EnvConfig, RewardConfig
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import export_trajectories
from apex_trainer.policies import make_policy
from apex_trainer.tracks import TRACK_A, TRACK_B
from apex_trainer.trajectory import (
    SCHEMA_PATH,
    SCHEMA_VERSION,
    load_json_schema,
    physics_config_hash,
    record_episode,
)

COLUMNS = ("t", "x", "y", "heading", "speed", "steer", "drive", "aLong", "aLat")


@pytest.fixture(scope="module")
def schema() -> dict[str, object]:
    assert SCHEMA_PATH.exists(), "run `cd app && npm run schema:generate`"
    return load_json_schema()


def _validate(doc: dict[str, object], schema: dict[str, object]) -> None:
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.validate(doc, schema)


@pytest.mark.parametrize("track", [TRACK_A, TRACK_B])
def test_scripted_export_is_valid_and_internally_consistent(
    track: str, schema: dict[str, object]
) -> None:
    env = ApexDriveEnv(track)
    doc = record_episode(
        env,
        make_policy("scripted"),
        seed=0,
        run_id="baseline",
        checkpoint_step=None,
        max_steps=1800,
    )
    _validate(doc, schema)
    meta = doc["meta"]
    assert isinstance(meta, dict)
    samples = doc["samples"]
    assert isinstance(samples, dict)
    n = meta["sampleCount"]
    assert n == 1801  # reset state + 1800 steps
    for c in COLUMNS:
        assert len(samples[c]) == n, c
    dt = DEFAULT_SIM.physics.dt
    for i in (0, 1, 2, 60, 1800):
        assert samples["t"][i] == pytest.approx(i * dt, abs=1e-12)
    # sample 0 is the reset state
    assert (samples["x"][0], samples["y"][0], samples["heading"][0]) == (0.0, 0.0, 0.0)
    assert samples["speed"][0] == DEFAULT_SIM.physics.start_speed
    assert samples["steer"][0] == samples["drive"][0] == samples["aLong"][0] == 0.0
    # laps match the world's lap times and index into samples
    laps = doc["laps"]
    assert isinstance(laps, list)
    assert [lap["lapTimeSec"] for lap in laps] == list(env.world.lap_times)
    assert laps[0]["startStep"] == 0
    if len(laps) > 1:
        assert laps[1]["startStep"] == round(laps[0]["lapTimeSec"] / dt)
    assert meta["trackId"] == track and meta["policy"] == "scripted"
    assert meta["crashed"] is False and meta["schemaVersion"] == SCHEMA_VERSION
    # every heading within (-π, π], every control within [-1, 1]
    assert all(-math.pi < h <= math.pi for h in samples["heading"])
    assert all(-1 <= v <= 1 for v in samples["steer"] + samples["drive"])


def test_crash_episode_export(schema: dict[str, object]) -> None:
    env = ApexDriveEnv(TRACK_A)
    doc = record_episode(
        env, make_policy("random-throttle"), seed=1, run_id="baseline", checkpoint_step=None
    )
    _validate(doc, schema)
    meta = doc["meta"]
    assert isinstance(meta, dict)
    assert meta["crashed"] is True
    assert meta["sampleCount"] == env.world.tick + 1
    assert doc["laps"] == []


def test_physics_config_hash_is_stable_and_sensitive() -> None:
    h = physics_config_hash(DEFAULT_ENV)
    assert len(h) == 12 and int(h, 16) >= 0
    assert h == physics_config_hash(EnvConfig())
    assert h != physics_config_hash(EnvConfig(reward=RewardConfig(crash_penalty=11.0)))


def test_export_cli_for_baseline_and_run(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], schema: dict[str, object]
) -> None:
    assert (
        cli.evaluate(
            [
                "--policy",
                "scripted",
                "--episodes",
                "2",
                "--max-steps",
                "120",
                "--export",
                str(tmp_path),
            ]
        )
        == 0
    )
    files = sorted(tmp_path.glob("*.trajectory.json"))
    assert [f.name for f in files] == [
        "scripted-track_a-ep0.trajectory.json",
        "scripted-track_a-ep1.trajectory.json",
    ]
    for f in files:
        _validate(json.loads(f.read_text()), schema)
    assert "wrote" in capsys.readouterr().out
    with pytest.raises(SystemExit):
        cli.evaluate(["--policy", "scripted", "--export"])  # baseline export needs DIR

    # run-dir form writes next to the eval summary
    from apex_trainer.train import TrainArgs, train
    from tests.test_train import SMOKE_ENV, SMOKE_PPO, SMOKE_TRAIN

    r = train(
        TrainArgs(
            steps=128,
            seed=3,
            runs_dir=tmp_path,
            run_id="x",
            env_cfg=SMOKE_ENV,
            ppo_cfg=SMOKE_PPO,
            train_cfg=SMOKE_TRAIN,
            log_stdout=False,
        )
    )
    assert (
        cli.evaluate([str(r.paths.root), "--episodes", "1", "--max-steps", "20", "--export"]) == 0
    )
    exported = list(r.paths.eval_dir.glob("*.trajectory.json"))
    assert [p.name for p in exported] == ["128-track_a-ep0.trajectory.json"]
    doc = json.loads(exported[0].read_text())
    _validate(doc, schema)
    assert doc["meta"]["runId"] == "x" and doc["meta"]["checkpointStep"] == 128
    assert doc["meta"]["policy"] == "ppo@128"


def test_export_trajectories_helper(tmp_path: Path) -> None:
    env = ApexDriveEnv(TRACK_A)
    out = export_trajectories(
        env,
        make_policy("random"),
        out_dir=tmp_path,
        stem="r",
        episodes=1,
        seed=0,
        run_id="baseline",
        checkpoint_step=None,
        max_steps=10,
    )
    assert out == [tmp_path / "r-ep0.trajectory.json"]
