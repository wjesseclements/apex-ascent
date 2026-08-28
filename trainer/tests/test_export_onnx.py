"""The ONNX export equals SB3's deterministic predict on real observations."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort
import pytest
from stable_baselines3 import PPO

from apex_trainer.debug.export_onnx import export_onnx
from apex_trainer.debug.golden_ppo import GOLDEN_CHECKPOINT
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import CheckpointPolicy
from apex_trainer.tracks import TRACK_A

# float32 MLP evaluated by two runtimes: 1e-5 is a rounding budget, far below the
# 1e-2 action resolution that would change a trajectory.
ACTION_TOL = 1e-5


@pytest.fixture(scope="module")
def onnx_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return export_onnx(GOLDEN_CHECKPOINT, tmp_path_factory.mktemp("onnx") / "tiny.onnx")


def test_export_matches_sb3_on_real_observations(onnx_path: Path) -> None:
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    assert [i.name for i in sess.get_inputs()] == ["obs"]
    assert [o.name for o in sess.get_outputs()] == ["action"]
    model = PPO.load(GOLDEN_CHECKPOINT, device="cpu")
    env = ApexDriveEnv(TRACK_A)
    policy = CheckpointPolicy(GOLDEN_CHECKPOINT)
    obs, _ = env.reset(seed=0)
    observations = [obs]
    for _ in range(300):
        obs, _r, term, trunc, _i = env.step(policy.act(obs, env))
        observations.append(obs)
        if term or trunc:
            obs, _ = env.reset(seed=1)
    batch = np.stack(observations).astype(np.float32)
    onnx_actions = sess.run(["action"], {"obs": batch})[0]
    sb3_actions, _ = model.predict(batch, deterministic=True)
    assert onnx_actions.shape == (len(observations), 2)
    assert np.max(np.abs(onnx_actions - sb3_actions)) < ACTION_TOL
    assert np.all(onnx_actions >= -1.0) and np.all(onnx_actions <= 1.0)


def test_export_handles_out_of_range_inputs_by_clipping(onnx_path: Path) -> None:
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    wild = np.full((4, 16), 50.0, dtype=np.float32)
    out = sess.run(["action"], {"obs": wild})[0]
    assert np.all(out >= -1.0) and np.all(out <= 1.0)
