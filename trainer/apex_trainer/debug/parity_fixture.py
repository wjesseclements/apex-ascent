"""Python↔TS parity fixtures (SPEC §9, Slice 8b gate).

    uv run python -m apex_trainer.debug.parity_fixture --out ../app/src/engine/sim/__fixtures__

Each tape: physics + ray config, the initial state, one action per tick, and
the full-precision resulting state, accelerations, progress, crash flag and
observation vector at every tick. The TS sim replays the actions OPEN-LOOP
and must reproduce the states within the named tolerances. Tapes: scripted
driver on all three tracks; the PPO competence checkpoint (E7 @ 8M) on Track A
(its actions ride the traction circle's edge, exercising the scaling path).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from apex_trainer.config import DEFAULT_ENV
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import CheckpointPolicy, Policy, make_policy
from apex_trainer.trajectory import physics_config_hash

TAPES: list[tuple[str, str, int]] = [
    ("scripted", "track_a", 1800),
    ("scripted", "track_a_mirror", 600),
    ("scripted", "track_b", 600),
    ("ppo", "track_a", 1800),
]
PPO_CHECKPOINT = Path("runs/e7-gamma0995-20m/checkpoints/ppo_8000000_steps.zip")


def record_tape(policy: Policy, track: str, ticks: int) -> dict[str, Any]:
    env = ApexDriveEnv(track, DEFAULT_ENV)
    obs, info = env.reset(seed=0)
    w = env.world
    initial = {"x": w.car.x, "y": w.car.y, "heading": w.car.heading, "speed": w.car.speed}
    actions: list[list[float]] = []
    cols: dict[str, list[Any]] = {
        k: [] for k in ("x", "y", "heading", "speed", "aLong", "aLat", "s", "crashed")
    }
    observations: list[list[float]] = [[float(v) for v in obs]]
    for _ in range(ticks):
        a = policy.act(obs, env)
        a = np.clip(np.asarray(a, dtype=np.float32), -1, 1)
        actions.append([float(a[0]), float(a[1])])
        obs, _r, terminated, truncated, info = env.step(a)
        w = env.world
        cols["x"].append(w.car.x)
        cols["y"].append(w.car.y)
        cols["heading"].append(w.car.heading)
        cols["speed"].append(w.car.speed)
        cols["aLong"].append(float(info["a_long"]))
        cols["aLat"].append(float(info["a_lat"]))
        cols["s"].append(w.progress.s)
        cols["crashed"].append(bool(w.crashed))
        observations.append([float(v) for v in obs])
        if terminated or truncated:
            break
    return {
        "policy": policy.name,
        "track": track,
        "physics": DEFAULT_ENV.sim.physics.to_dict(),
        "rays": DEFAULT_ENV.sim.rays.to_dict(),
        "physicsConfigHash": physics_config_hash(DEFAULT_ENV),
        "startSpeed": DEFAULT_ENV.sim.physics.start_speed,
        "initial": initial,
        "ticks": len(actions),
        "actions": actions,
        "expected": cols,
        "observations": observations,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--ppo-checkpoint", type=Path, default=PPO_CHECKPOINT)
    args = p.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, track, ticks in TAPES:
        policy: Policy = (
            CheckpointPolicy(args.ppo_checkpoint, name="ppo@8000000")
            if name == "ppo"
            else make_policy("scripted")
        )
        tape = record_tape(policy, track, ticks)
        out = args.out / f"parity-{name}-{track}.json"
        out.write_text(json.dumps(tape, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"wrote {out.name}: {tape['ticks']} ticks, crashed={tape['expected']['crashed'][-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
