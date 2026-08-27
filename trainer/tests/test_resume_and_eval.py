"""Resume continuity, checkpoint evaluation, and the determinism pins (SPEC §9/§10)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pytest

from apex_trainer import cli
from apex_trainer.debug.golden_ppo import GOLDEN_CHECKPOINT, GOLDEN_STATS, evaluate_golden
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import evaluate_checkpoint, run_episode
from apex_trainer.policies import CheckpointPolicy
from apex_trainer.runs import list_checkpoints, read_metadata
from apex_trainer.train import TrainArgs, train
from tests.test_train import SMOKE_ENV, SMOKE_PPO, SMOKE_TRAIN

# Pinned-eval tolerances (approved scope: aggregates, not a cross-machine bit-exact
# trajectory). torch CPU kernels can differ in the last ulp between machines and a
# closed loop amplifies that; these bounds are far above such drift and far below
# what a real change to the env, the policy loader or the eval loop would cause.
PIN_DISTANCE_TOL = 1.0  # m
PIN_STEPS_TOL = 60  # ticks (1 s)


def _args(runs_dir: Path, run_id: str, steps: int, resume: Path | None = None) -> TrainArgs:
    return TrainArgs(
        steps=steps,
        seed=3,
        runs_dir=runs_dir,
        run_id=run_id,
        resume=resume,
        env_cfg=SMOKE_ENV,
        ppo_cfg=SMOKE_PPO,
        train_cfg=SMOKE_TRAIN,
        log_stdout=False,
    )


def test_resume_continues_steps_checkpoints_and_tensorboard(tmp_path: Path) -> None:
    first = train(_args(tmp_path, "r", 256))
    assert [s for s, _ in list_checkpoints(first.paths)] == [128, 256]

    second = train(_args(tmp_path, "ignored", 512, resume=first.paths.root))
    assert second.paths == first.paths
    assert (second.steps_before, second.steps_after) == (256, 512)
    assert [s for s, _ in list_checkpoints(second.paths)] == [128, 256, 384, 512]

    meta = read_metadata(second.paths)
    assert [s["resumed_from_steps"] for s in meta["sessions"]] == [None, 256]
    assert [s["final_steps"] for s in meta["sessions"]] == [256, 512]

    # TensorBoard continuity: the resumed session's step axis continues from 256 to
    # 512, a second event file was appended in the same tb/ directory, and the first
    # session's progress.csv was preserved rather than overwritten.
    with (second.paths.tb_dir / "progress.csv").open() as f:
        steps = [int(r["time/total_timesteps"]) for r in csv.DictReader(f)]
    assert steps == sorted(steps) and 256 < steps[0] and steps[-1] == 512
    with (second.paths.tb_dir / "progress_until_256.csv").open() as f:
        first_steps = [int(r["time/total_timesteps"]) for r in csv.DictReader(f)]
    assert first_steps[-1] == 256
    assert len(list(second.paths.tb_dir.glob("events.out.tfevents.*"))) == 2

    # cumulative semantics: asking for a target already reached trains nothing
    third = train(_args(tmp_path, "ignored", 512, resume=first.paths.root))
    assert (third.steps_before, third.steps_after) == (512, 512)


def test_resume_without_checkpoints_fails_clearly(tmp_path: Path) -> None:
    first = train(_args(tmp_path, "nc", 128))
    for _, p in list_checkpoints(first.paths):
        p.unlink()
    with pytest.raises(FileNotFoundError, match="no checkpoint"):
        train(_args(tmp_path, "ignored", 256, resume=first.paths.root))


def test_evaluate_checkpoint_writes_eval_json(tmp_path: Path) -> None:
    r = train(_args(tmp_path, "e", 256))
    out, stats, track = evaluate_checkpoint(
        r.paths, checkpoint_steps=None, track=None, episodes=2, seed=0, max_steps=100
    )
    assert track == "track_a" and len(stats) == 2
    assert out == r.paths.eval_dir / "256-track_a.json"
    data = json.loads(out.read_text())
    assert data["checkpoint_steps"] == 256 and data["seed"] == 0
    assert len(data["episodes"]) == 2 and "summary" in data
    out_b, _, _ = evaluate_checkpoint(
        r.paths, checkpoint_steps=128, track="track_b", episodes=1, seed=0, max_steps=50
    )
    assert out_b.name == "128-track_b.json"
    with pytest.raises(FileNotFoundError, match="no checkpoint at 999"):
        evaluate_checkpoint(r.paths, checkpoint_steps=999, track=None, episodes=1, seed=0)


def test_evaluate_cli_run_dir_form(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    r = train(_args(tmp_path, "c", 256))
    assert cli.evaluate([str(r.paths.root), "--episodes", "1", "--max-steps", "30"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("episode 1: 30 steps")
    assert "summary: ppo@256 on track_a, 1 episode(s)" in out
    assert "wrote" in out
    with pytest.raises(SystemExit):
        cli.evaluate([str(r.paths.root), "--policy", "scripted"])
    with pytest.raises(SystemExit):
        cli.evaluate(["--policy", "scripted", "--checkpoint", "5"])


def test_same_checkpoint_seed_track_gives_bit_identical_trajectory(tmp_path: Path) -> None:
    # SPEC §9: evaluation is deterministic. Same process, same machine: bit-equal.
    r = train(_args(tmp_path, "d", 256))
    ckpt = list_checkpoints(r.paths)[-1][1]
    env = ApexDriveEnv("track_a")

    def trajectory() -> list[np.ndarray]:
        policy = CheckpointPolicy(ckpt)
        obs, _ = env.reset(seed=0)
        seq = [obs]
        for _ in range(300):
            obs, *_ = env.step(policy.act(obs, env))
            seq.append(obs)
        return seq

    a, b = trajectory(), trajectory()
    assert all(np.array_equal(x, y) for x, y in zip(a, b, strict=True))
    assert run_episode(env, CheckpointPolicy(ckpt), seed=0, max_steps=300) == run_episode(
        env, CheckpointPolicy(ckpt), seed=0, max_steps=300
    )


def test_committed_tiny_checkpoint_matches_pinned_eval() -> None:
    assert GOLDEN_CHECKPOINT.exists() and GOLDEN_CHECKPOINT.stat().st_size < 400_000
    pinned = json.loads(GOLDEN_STATS.read_text(encoding="utf-8"))
    actual = evaluate_golden(GOLDEN_CHECKPOINT)
    assert len(actual) == len(pinned["episodes"]) == pinned["recipe"]["eval_episodes"]
    for got, want in zip(actual, pinned["episodes"], strict=True):
        assert got["crashed"] == want["crashed"]
        assert got["laps"] == want["laps"]
        assert got["distance"] == pytest.approx(want["distance"], abs=PIN_DISTANCE_TOL)
        assert abs(got["steps"] - want["steps"]) <= PIN_STEPS_TOL
