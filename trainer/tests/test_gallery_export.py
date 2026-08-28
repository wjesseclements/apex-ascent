"""Gallery export (Slice 7): decimated trajectories keep the contract; the manifest
validates against the app-generated gallery.schema.json."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from apex_trainer.debug.export_gallery import export_gallery
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import make_policy
from apex_trainer.runs import list_checkpoints, open_run
from apex_trainer.tracks import TRACK_A
from apex_trainer.train import TrainArgs, train
from apex_trainer.trajectory import load_gallery_json_schema, load_json_schema, record_episode
from tests.test_train import SMOKE_ENV, SMOKE_PPO, SMOKE_TRAIN


def test_decimated_export_keeps_the_contract() -> None:
    env = ApexDriveEnv(TRACK_A)
    full = record_episode(
        env, make_policy("scripted"), seed=0, run_id="b", checkpoint_step=None, max_steps=600
    )
    half = record_episode(
        env,
        make_policy("scripted"),
        seed=0,
        run_id="b",
        checkpoint_step=None,
        max_steps=600,
        decimate=2,
    )
    jsonschema.validate(half, load_json_schema())
    assert half["meta"]["dt"] == pytest.approx(2 / 60)
    assert half["meta"]["sampleCount"] == 301 and full["meta"]["sampleCount"] == 601
    for i in (0, 1, 7, 300):
        assert half["samples"]["t"][i] == i * half["meta"]["dt"]  # exact
        for c in ("x", "y", "heading", "speed", "steer", "drive", "aLong", "aLat"):
            assert half["samples"][c][i] == full["samples"][c][2 * i], (c, i)
    assert half["laps"] == [] or all(
        lap["startStep"] < half["meta"]["sampleCount"] for lap in half["laps"]
    )
    with pytest.raises(ValueError):
        record_episode(
            env,
            make_policy("scripted"),
            seed=0,
            run_id="b",
            checkpoint_step=None,
            max_steps=10,
            decimate=0,
        )


def test_lap_start_steps_are_reindexed_when_decimating() -> None:
    env = ApexDriveEnv(TRACK_A)
    full = record_episode(
        env, make_policy("scripted"), seed=0, run_id="b", checkpoint_step=None, max_steps=1800
    )
    half = record_episode(
        env,
        make_policy("scripted"),
        seed=0,
        run_id="b",
        checkpoint_step=None,
        max_steps=1800,
        decimate=2,
    )
    assert len(full["laps"]) == len(half["laps"]) >= 1
    assert [round(lap["lapTimeSec"], 6) for lap in full["laps"]] == [
        round(lap["lapTimeSec"], 6) for lap in half["laps"]
    ]
    assert half["laps"][0]["startStep"] == 0


def test_export_gallery_manifest_validates(tmp_path: Path) -> None:
    r = train(
        TrainArgs(
            steps=256,
            seed=3,
            runs_dir=tmp_path,
            run_id="g",
            env_cfg=SMOKE_ENV,
            ppo_cfg=SMOKE_PPO,
            train_cfg=SMOKE_TRAIN,
            log_stdout=False,
        )
    )
    steps = [s for s, _ in list_checkpoints(r.paths)]
    out = tmp_path / "gallery"
    manifest = export_gallery(
        open_run(r.paths.root),
        plan={"track_a": steps, "track_b": steps[-1:]},
        out_dir=out,
        hz=30.0,
        title="smoke",
        description="",
        labels={steps[-1]: "last"},
        notes={steps[-1]: "n"},
    )
    jsonschema.validate(manifest, load_gallery_json_schema())
    on_disk = json.loads((out / "manifest.json").read_text())
    assert on_disk == manifest
    assert [c["step"] for c in manifest["checkpoints"]] == steps
    assert manifest["checkpoints"][-1]["label"] == "last"
    assert manifest["config"]["gamma"] == SMOKE_PPO.gamma and manifest["tracks"] == [
        "track_a",
        "track_b",
    ]
    files = sorted(p.name for p in out.glob("*.trajectory.json"))
    assert len(files) == len(steps) + 1
    for entry in manifest["checkpoints"][-1]["entries"]:
        doc = json.loads((out / entry["file"]).read_text())
        jsonschema.validate(doc, load_json_schema())
        assert doc["meta"]["dt"] == pytest.approx(1 / 30) and entry["sampleHz"] == 30.0
        assert doc["meta"]["crashed"] == entry["crashed"]
    with pytest.raises(ValueError, match="divide"):
        export_gallery(
            open_run(r.paths.root),
            plan={"track_a": steps[:1]},
            out_dir=out,
            hz=25.0,
            title="x",
            description="",
            labels={},
            notes={},
        )
