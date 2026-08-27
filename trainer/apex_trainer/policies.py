"""Baseline policies for evaluation: scripted, random, random-throttle.

A :class:`Policy` maps an observation to an action. The scripted policy is
*privileged* — it reads the sim state through the env rather than the
observation — because it's a reference driver, not a learner. Learned
policies (Slice 4) see only the observation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np

from apex_trainer.env import Act, ApexDriveEnv, Obs
from apex_trainer.sim.scripted import DEFAULT_SCRIPTED, ScriptedDriverConfig, scripted_action
from apex_trainer.sim.world import sense

POLICY_NAMES = ("scripted", "random", "random-throttle")

# Random-throttle floor: uniform random actions average to zero drive and, with
# brake (20) stronger than throttle (12), the car just dithers on the start line.
# Holding the throttle at ≥ 0.2 makes the random driver actually go — and crash.
RANDOM_THROTTLE_MIN = 0.2


class Policy(Protocol):
    name: str

    def reset(self, seed: int | None) -> None: ...

    def act(self, obs: Obs, env: ApexDriveEnv) -> Act: ...


class ScriptedPolicy:
    name = "scripted"

    def __init__(self, driver: ScriptedDriverConfig = DEFAULT_SCRIPTED) -> None:
        self.driver = driver

    def reset(self, seed: int | None) -> None:
        return None

    def act(self, obs: Obs, env: ApexDriveEnv) -> Act:
        a = scripted_action(
            sense(env.track, env.world, env.cfg.sim), env.world.car.speed, env.cfg.sim, self.driver
        )
        return np.array([a.steer, a.drive], dtype=np.float32)


class RandomPolicy:
    """Uniform random steer and drive every tick (the textbook 'random policy')."""

    name = "random"

    def __init__(self) -> None:
        self.rng = np.random.default_rng(0)

    def reset(self, seed: int | None) -> None:
        self.rng = np.random.default_rng(seed)

    def act(self, obs: Obs, env: ApexDriveEnv) -> Act:
        return self.rng.uniform(-1.0, 1.0, size=2).astype(np.float32)


class RandomThrottlePolicy(RandomPolicy):
    """Uniform random steer with the throttle held on (drive ∈ [RANDOM_THROTTLE_MIN, 1])."""

    name = "random-throttle"

    def act(self, obs: Obs, env: ApexDriveEnv) -> Act:
        steer = self.rng.uniform(-1.0, 1.0)
        drive = self.rng.uniform(RANDOM_THROTTLE_MIN, 1.0)
        return np.array([steer, drive], dtype=np.float32)


def make_policy(name: str) -> Policy:
    if name == "scripted":
        return ScriptedPolicy()
    if name == "random":
        return RandomPolicy()
    if name == "random-throttle":
        return RandomThrottlePolicy()
    raise ValueError(f"unknown policy {name!r}; choose from {', '.join(POLICY_NAMES)}")


class CheckpointPolicy:
    """A trained SB3 PPO checkpoint, run deterministically (mean action, no
    exploration noise) — SPEC §6 evaluation."""

    def __init__(self, checkpoint: Path, name: str | None = None) -> None:
        from stable_baselines3 import PPO

        self.model = PPO.load(checkpoint, device="cpu")
        self.name = name or checkpoint.stem

    def reset(self, seed: int | None) -> None:
        return None

    def act(self, obs: Obs, env: ApexDriveEnv) -> Act:
        action, _ = self.model.predict(obs, deterministic=True)
        return np.asarray(action, dtype=np.float32)
