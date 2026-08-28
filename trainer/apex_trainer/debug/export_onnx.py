"""Export an SB3 PPO checkpoint's DETERMINISTIC policy to ONNX for the browser.

    uv run python -m apex_trainer.debug.export_onnx runs/<id> --checkpoint N \\
        --out ../app/public/models/<name>.onnx

The exported graph is exactly `model.predict(obs, deterministic=True)`: the
policy's feature extractor (flatten) → mlp_extractor.policy_net → action_net
→ clip to the action bounds [−1, 1]. Input `obs` is float32 [batch, 16];
output `action` is float32 [batch, 2]. Verified against SB3 on real
observations in ``tests/test_export_onnx.py``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from gymnasium import spaces
from stable_baselines3 import PPO
from torch import nn

from apex_trainer.runs import checkpoint_path, open_run

OPSET = 17


class DeterministicPolicy(nn.Module):
    """obs → clipped mean action, mirroring SB3's ActorCriticPolicy deterministic path."""

    def __init__(self, model: PPO) -> None:
        super().__init__()
        policy = model.policy
        self.features = policy.features_extractor
        self.pi = policy.mlp_extractor.policy_net
        self.action_net = policy.action_net
        space = model.action_space
        assert isinstance(space, spaces.Box)
        self.low: torch.Tensor
        self.high: torch.Tensor
        self.register_buffer("low", torch.as_tensor(space.low, dtype=torch.float32))
        self.register_buffer("high", torch.as_tensor(space.high, dtype=torch.float32))

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        latent = self.pi(self.features(obs))
        mean: torch.Tensor = self.action_net(latent)
        return torch.max(torch.min(mean, self.high), self.low)


def export_onnx(checkpoint: Path, out: Path) -> Path:
    model = PPO.load(checkpoint, device="cpu")
    module = DeterministicPolicy(model).eval()
    shape = model.observation_space.shape
    assert shape is not None
    obs_dim = int(shape[0])
    example = torch.zeros(1, obs_dim, dtype=torch.float32)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        module,
        (example,),
        str(out),
        input_names=["obs"],
        output_names=["action"],
        dynamic_axes={"obs": {0: "batch"}, "action": {0: "batch"}},
        opset_version=OPSET,
        dynamo=False,
    )
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("run", type=Path)
    p.add_argument("--checkpoint", type=int, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args(argv)
    paths = open_run(args.run)
    out = export_onnx(checkpoint_path(paths, args.checkpoint), args.out)
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
