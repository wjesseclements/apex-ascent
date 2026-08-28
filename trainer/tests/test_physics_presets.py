"""Slice 8a: physics presets are named, hashed differently, and never move the default."""

from __future__ import annotations

from pathlib import Path

import pytest

from apex_trainer import cli
from apex_trainer.config import (
    DEFAULT_ENV,
    DEFAULT_PHYSICS,
    LOW_DRAG_PHYSICS,
    NO_DRAG_PHYSICS,
    PHYSICS_PRESETS,
    env_config_from_dict,
    env_config_with_physics,
)
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import run_episode
from apex_trainer.policies import make_policy
from apex_trainer.runs import open_run, read_config_snapshot
from apex_trainer.tracks import TRACK_A
from apex_trainer.trajectory import physics_config_hash


def test_presets_differ_only_in_drag_and_hash_differently() -> None:
    assert PHYSICS_PRESETS["default"] is DEFAULT_PHYSICS
    assert LOW_DRAG_PHYSICS.drag == 0.05 and NO_DRAG_PHYSICS.drag == 0.0
    for preset in (LOW_DRAG_PHYSICS, NO_DRAG_PHYSICS):
        d, e = preset.to_dict(), DEFAULT_PHYSICS.to_dict()
        assert {k for k in d if d[k] != e[k]} == {"drag"}
    hashes = {physics_config_hash(env_config_with_physics(p)) for p in PHYSICS_PRESETS}
    assert len(hashes) == 3
    assert physics_config_hash(DEFAULT_ENV) == "fc40dfb0b2c9"  # the default never moves
    with pytest.raises(ValueError, match="unknown physics preset"):
        env_config_with_physics("moon")


def test_low_drag_actually_needs_braking() -> None:
    # Coasting from 30 m/s for 6 s: default drag scrubs to ~5 m/s, low drag barely moves.
    from apex_trainer.sim.car import Action, CarState, step_car

    def coast(phys: object) -> float:
        st = CarState(0.0, 0.0, 0.0, 30.0)
        for _ in range(360):
            st = step_car(st, Action(0.0, 0.0), phys).state  # type: ignore[arg-type]
        return st.speed

    assert coast(DEFAULT_PHYSICS) < 6.0
    assert 22.0 < coast(LOW_DRAG_PHYSICS) < 23.0
    assert coast(NO_DRAG_PHYSICS) == pytest.approx(30.0)


@pytest.mark.parametrize("preset", ["low-drag", "no-drag"])
def test_scripted_driver_still_laps_under_low_drag(preset: str) -> None:
    env = ApexDriveEnv(TRACK_A, env_config_with_physics(preset))
    st = run_episode(env, make_policy("scripted"), seed=0, max_steps=3600)
    base = run_episode(ApexDriveEnv(TRACK_A), make_policy("scripted"), seed=0, max_steps=3600)
    assert not st.crashed and st.laps >= 2
    assert st.lap_times != base.lap_times  # the physics actually changed the episode
    assert st.mean_drive < base.mean_drive  # less drag ⇒ less throttle needed


def test_evaluate_cli_applies_the_physics_preset(capsys: pytest.CaptureFixture[str]) -> None:
    cli.evaluate(["--policy", "scripted", "--episodes", "1", "--max-steps", "1800"])
    default = capsys.readouterr().out
    cli.evaluate(
        ["--policy", "scripted", "--episodes", "1", "--max-steps", "1800", "--physics", "no-drag"]
    )
    nodrag = capsys.readouterr().out
    assert default != nodrag


def test_preset_lands_in_the_run_snapshot(tmp_path: Path) -> None:
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
                "ld",
                "--physics",
                "low-drag",
            ]
        )
        == 0
    )
    snap = read_config_snapshot(open_run(tmp_path / "ld"))
    assert snap["env"]["sim"]["physics"]["drag"] == 0.05
    assert env_config_from_dict(snap["env"]).sim.physics == LOW_DRAG_PHYSICS
