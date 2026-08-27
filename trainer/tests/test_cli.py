"""CLI: train (Slice 4) and evaluate (Slice 3) entry points."""

from __future__ import annotations

from pathlib import Path

import pytest

from apex_trainer import cli


def test_train_requires_steps() -> None:
    with pytest.raises(SystemExit):
        cli.train([])


def test_train_cli_smoke(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    # Full CLI path with the default PPO config but a tiny budget: proves argument
    # plumbing; the real smoke test with checkpoints lives in test_train.py.
    assert (
        cli.train(
            [
                "--steps",
                "64",
                "--n-envs",
                "2",
                "--runs-dir",
                str(tmp_path),
                "--run-id",
                "cli-smoke",
                "--checkpoint-interval",
                "64",
            ]
        )
        == 0
    )
    out = capsys.readouterr().out
    # SB3 always finishes a full rollout (n_steps × n_envs = 4096 here), so --steps is a
    # floor rounded up to the rollout boundary.
    assert "run cli-smoke: 0 → 4096 steps (4096 this session)" in out
    assert (tmp_path / "cli-smoke" / "config.json").exists()


def test_evaluate_unknown_run_dir_fails_clearly() -> None:
    with pytest.raises(FileNotFoundError, match="not a run directory"):
        cli.evaluate(["runs/does-not-exist", "--checkpoint", "50000"])


def test_evaluate_requires_a_policy_or_run_dir() -> None:
    with pytest.raises(SystemExit):
        cli.evaluate([])


def test_evaluate_scripted_prints_episodes_and_summary(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.evaluate(["--policy", "scripted", "--episodes", "2", "--max-steps", "1800"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert len(out) == 3
    assert out[0].startswith("episode 1: 1800 steps, truncated, laps 1 (25.70 s)")
    assert "mean drive" in out[0]
    assert out[2].startswith("summary: scripted on track_a, 2 episode(s): crash rate 0/2")
    assert "best lap 25.70 s" in out[2] and "mean drive" in out[2]


def test_evaluate_random_throttle_crashes(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.evaluate(["--policy", "random-throttle", "--episodes", "3", "--seed", "1"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert "crash rate 3/3" in out[-1]
