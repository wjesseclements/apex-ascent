"""Trajectory export — the trainer's side of the SPEC §7 contract.

The Zod schema in ``app/src/engine/schema.ts`` is the source of truth; the
generated ``trajectory.schema.json`` at the repo root is what this module's
output is validated against in tests (``tests/test_trajectory.py``), so drift
between the two halves fails CI.

Samples are equal-length columns; sample ``i`` is at ``t = i * dt`` exactly and
sample 0 is the reset state with zero controls/accelerations.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apex_trainer.config import EnvConfig
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import Policy

SCHEMA_VERSION = 1
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "trajectory.schema.json"
HASH_HEX_CHARS = 12


def physics_config_hash(env_cfg: EnvConfig) -> str:
    """First 12 hex chars of SHA-256 over the canonical env-config JSON."""
    canonical = json.dumps(env_cfg.to_dict(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:HASH_HEX_CHARS]


@dataclass
class TrajectoryRecorder:
    """Accumulates one episode's samples as columns."""

    t: list[float] = field(default_factory=list)
    x: list[float] = field(default_factory=list)
    y: list[float] = field(default_factory=list)
    heading: list[float] = field(default_factory=list)
    speed: list[float] = field(default_factory=list)
    steer: list[float] = field(default_factory=list)
    drive: list[float] = field(default_factory=list)
    a_long: list[float] = field(default_factory=list)
    a_lat: list[float] = field(default_factory=list)

    def append(
        self,
        env: ApexDriveEnv,
        *,
        steer: float,
        drive: float,
        a_long: float,
        a_lat: float,
    ) -> None:
        w = env.world
        self.t.append(w.tick * env.cfg.sim.physics.dt)
        self.x.append(w.car.x)
        self.y.append(w.car.y)
        self.heading.append(w.car.heading)
        self.speed.append(w.car.speed)
        self.steer.append(steer)
        self.drive.append(drive)
        self.a_long.append(a_long)
        self.a_lat.append(a_lat)

    def columns(self) -> dict[str, list[float]]:
        return {
            "t": self.t,
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
            "speed": self.speed,
            "steer": self.steer,
            "drive": self.drive,
            "aLong": self.a_long,
            "aLat": self.a_lat,
        }


def record_episode(
    env: ApexDriveEnv,
    policy: Policy,
    *,
    seed: int,
    run_id: str,
    checkpoint_step: int | None,
    max_steps: int | None = None,
) -> dict[str, Any]:
    """Run one deterministic episode and return the trajectory document."""
    policy.reset(seed)
    obs, info = env.reset(seed=seed)
    rec = TrajectoryRecorder()
    rec.append(env, steer=0.0, drive=0.0, a_long=0.0, a_lat=0.0)
    limit = max_steps if max_steps is not None else env.cfg.episode.max_steps
    terminated = truncated = False
    steps = 0
    while steps < limit and not (terminated or truncated):
        action = policy.act(obs, env)
        obs, _reward, terminated, truncated, info = env.step(action)
        steps += 1
        rec.append(
            env,
            steer=float(max(-1.0, min(1.0, float(action[0])))),
            drive=float(max(-1.0, min(1.0, float(action[1])))),
            a_long=float(info["a_long"]),
            a_lat=float(info["a_lat"]),
        )
    w = env.world
    laps = []
    start = 0
    for lap_time in w.lap_times:
        laps.append({"lapTimeSec": lap_time, "startStep": start})
        start += round(lap_time / env.cfg.sim.physics.dt)
    return {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "runId": run_id,
            "checkpointStep": checkpoint_step,
            "policy": policy.name,
            "trackId": env.track.name,
            "physicsConfigHash": physics_config_hash(env.cfg),
            "seed": seed,
            "dt": env.cfg.sim.physics.dt,
            "createdAt": datetime.now(UTC).isoformat(),
            "sampleCount": len(rec.t),
            "crashed": bool(w.crashed),
        },
        "laps": laps,
        "samples": rec.columns(),
    }


def write_trajectory(doc: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8")
    return path


def load_json_schema() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return data
