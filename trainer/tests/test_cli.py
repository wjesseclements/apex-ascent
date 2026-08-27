"""CLI: evaluate is real (Slice 3); train/tensorboard still name their slice."""

from __future__ import annotations

import pytest

from apex_trainer import cli


def test_train_and_tensorboard_stubs_report_their_slice(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.train() == 2
    assert cli.tensorboard() == 2
    err = capsys.readouterr().err
    assert "train: not implemented until Slice 4" in err
    assert "tensorboard: not implemented until Slice 4" in err


def test_evaluate_run_dir_form_is_reserved_for_slice_4(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.evaluate(["runs/abc", "--checkpoint", "50000"]) == 2
    assert "not implemented until Slice 4" in capsys.readouterr().err


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
