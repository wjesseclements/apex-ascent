"""Run directories: ``runs/<run_id>/`` is the unit of reproducibility (CLAUDE.md
trainer rule 6). Nothing about a run lives only in a terminal.

    runs/<run_id>/
      config.json        full snapshot: env + PPO + train configs, seed, track
      metadata.json      run_id, created_at, git sha, versions, argv, sessions[]
      checkpoints/       ppo_<steps>_steps.zip
      tb/                TensorBoard events + progress.csv
      eval/              <checkpoint>-<track>.json summaries (Slice 4); trajectories (Slice 5)

Wall-clock time appears here only to *name* runs and stamp metadata; it never
enters the simulation.
"""

from __future__ import annotations

import json
import platform
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apex_trainer.config import EnvConfig, PPOConfig, TrainConfig

TRAINER_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUNS_DIR = TRAINER_ROOT / "runs"
CHECKPOINT_PREFIX = "ppo"
_CHECKPOINT_RE = re.compile(rf"^{CHECKPOINT_PREFIX}_(\d+)_steps\.zip$")

RESUME_NOTE = (
    "Resume restores network weights and the step counter, not mid-stream RNG state: "
    "a resumed run is not bit-identical to an uninterrupted run of the same total steps."
)


@dataclass(frozen=True)
class RunPaths:
    root: Path

    @property
    def run_id(self) -> str:
        return self.root.name

    @property
    def config_json(self) -> Path:
        return self.root / "config.json"

    @property
    def metadata_json(self) -> Path:
        return self.root / "metadata.json"

    @property
    def checkpoints_dir(self) -> Path:
        return self.root / "checkpoints"

    @property
    def tb_dir(self) -> Path:
        return self.root / "tb"

    @property
    def eval_dir(self) -> Path:
        return self.root / "eval"


def make_run_id(track: str, seed: int, now: datetime | None = None) -> str:
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{track}-s{seed}"


def create_run(runs_dir: Path, run_id: str) -> RunPaths:
    paths = RunPaths(runs_dir / run_id)
    if paths.root.exists():
        raise FileExistsError(f"run directory already exists: {paths.root}")
    for d in (paths.root, paths.checkpoints_dir, paths.tb_dir, paths.eval_dir):
        d.mkdir(parents=True)
    return paths


def open_run(path: Path) -> RunPaths:
    paths = RunPaths(path.resolve())
    if not paths.config_json.exists():
        raise FileNotFoundError(f"not a run directory (no config.json): {path}")
    return paths


def write_config_snapshot(
    paths: RunPaths,
    *,
    env_cfg: EnvConfig,
    ppo_cfg: PPOConfig,
    train_cfg: TrainConfig,
    seed: int,
    track: str,
) -> None:
    snapshot = {
        "track": track,
        "seed": seed,
        "env": env_cfg.to_dict(),
        "ppo": ppo_cfg.to_dict(),
        "train": train_cfg.to_dict(),
    }
    paths.config_json.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")


def read_config_snapshot(paths: RunPaths) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(paths.config_json.read_text(encoding="utf-8"))
    return data


def git_sha() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=TRAINER_ROOT, capture_output=True, text=True
        )
    except OSError:
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def versions() -> dict[str, str]:
    import gymnasium
    import numpy
    import stable_baselines3
    import torch

    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "numpy": numpy.__version__,
        "gymnasium": gymnasium.__version__,
        "stable_baselines3": stable_baselines3.__version__,
        "torch": torch.__version__,
    }


def new_metadata(paths: RunPaths, *, track: str, seed: int, argv: list[str]) -> dict[str, Any]:
    return {
        "run_id": paths.run_id,
        "track": track,
        "seed": seed,
        "created_at": datetime.now(UTC).isoformat(),
        "git_sha": git_sha(),
        "versions": versions(),
        "argv": argv,
        "sessions": [],
        "notes": [RESUME_NOTE],
    }


def write_metadata(paths: RunPaths, metadata: dict[str, Any]) -> None:
    paths.metadata_json.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def read_metadata(paths: RunPaths) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(paths.metadata_json.read_text(encoding="utf-8"))
    return data


def checkpoint_path(paths: RunPaths, steps: int) -> Path:
    return paths.checkpoints_dir / f"{CHECKPOINT_PREFIX}_{steps}_steps.zip"


def list_checkpoints(paths: RunPaths) -> list[tuple[int, Path]]:
    """(steps, path) for every checkpoint, ascending by steps."""
    found: list[tuple[int, Path]] = []
    for p in paths.checkpoints_dir.glob("*.zip"):
        m = _CHECKPOINT_RE.match(p.name)
        if m:
            found.append((int(m.group(1)), p))
    return sorted(found)


def latest_checkpoint(paths: RunPaths) -> tuple[int, Path] | None:
    cps = list_checkpoints(paths)
    return cps[-1] if cps else None


def python_argv() -> list[str]:
    return list(sys.argv)
