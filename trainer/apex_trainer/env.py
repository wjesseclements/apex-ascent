"""``ApexDrive-v0``: the Gymnasium environment around the pure sim.

This is the only module where numpy touches simulation state: the sim core
(``apex_trainer.sim``) stays plain Python; the env converts at the boundary.

Observation / action / reward / episode rules are SPEC §§3–5, with every
constant in :mod:`apex_trainer.config`. ``reset()`` is deterministic (start
line, centered, ``start_speed``); the ``seed`` is accepted and stored for API
compliance and run metadata but nothing in v0 is random (approved: no reset
randomization in v0; revisit in Slice 6 only with evidence).
"""

from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from numpy.typing import NDArray

from apex_trainer.config import DEFAULT_ENV, EnvConfig
from apex_trainer.sim.car import Action, clamp_action
from apex_trainer.sim.geometry import left_normal
from apex_trainer.sim.track import Track
from apex_trainer.sim.world import WorldState, reset, reset_at, sense, step, world_time
from apex_trainer.tracks import TRACK_A, load_track

ENV_ID = "ApexDrive-v0"

Obs = NDArray[np.float32]
Act = NDArray[np.float32]


class ApexDriveEnv(gym.Env[Obs, Act]):
    metadata: dict[str, Any] = {"render_modes": []}

    def __init__(self, track: str | Track = TRACK_A, cfg: EnvConfig = DEFAULT_ENV) -> None:
        super().__init__()
        self.track: Track = load_track(track) if isinstance(track, str) else track
        self.cfg = cfg
        n_rays = cfg.sim.rays.count
        low = np.concatenate(
            [np.zeros(n_rays), [0.0], [-1.0], [-1.0, -1.0]],
        ).astype(np.float32)
        high = np.concatenate(
            [np.ones(n_rays), [1.0], [1.0], [1.0, 1.0]],
        ).astype(np.float32)
        assert low.shape == (cfg.observation.size(cfg.sim.rays),)
        self.observation_space = spaces.Box(low=low, high=high, dtype=np.float32)
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=np.float32)

        self._world: WorldState = reset(self.track, cfg.sim)
        self._prev_action: Action = Action(0.0, 0.0)
        self._a_lat: float = 0.0
        self.last_seed: int | None = None

    # -- Gymnasium API -------------------------------------------------------

    def reset(
        self, *, seed: int | None = None, options: dict[str, Any] | None = None
    ) -> tuple[Obs, dict[str, Any]]:
        super().reset(seed=seed)
        if seed is not None:
            self.last_seed = seed
        self._world = self._initial_world()
        self._prev_action = Action(0.0, 0.0)
        self._a_lat = 0.0
        return self._observe(), self._info(a_long=0.0, delta_s=0.0, lap_completed=False)

    def step(self, action: Act) -> tuple[Obs, float, bool, bool, dict[str, Any]]:
        act = clamp_action(Action(steer=float(action[0]), drive=float(action[1])))
        world, t = step(self.track, self._world, act, self.cfg.sim)
        self._world = world
        self._prev_action = act
        self._a_lat = t.a_lat

        reward = t.delta_s * self.cfg.reward.progress_scale
        if world.crashed:
            reward -= self.cfg.reward.crash_penalty
        terminated = world.crashed
        truncated = (not terminated) and world.tick >= self.cfg.episode.max_steps
        info = self._info(a_long=t.a_long, delta_s=t.delta_s, lap_completed=t.lap_completed)
        return self._observe(), float(reward), terminated, truncated, info

    # -- internals -----------------------------------------------------------

    def _initial_world(self) -> WorldState:
        """Deterministic start, or a jittered one drawn from the seeded env RNG."""
        jitter = self.cfg.episode.start_jitter
        track, physics = self.track, self.cfg.sim.physics
        if not jitter.enabled:
            return reset(track, self.cfg.sim)
        rng = self.np_random
        d_speed = float(rng.uniform(-jitter.speed, jitter.speed)) if jitter.speed else 0.0
        d_lat = float(rng.uniform(-jitter.lateral, jitter.lateral)) if jitter.lateral else 0.0
        d_head = float(rng.uniform(-jitter.heading, jitter.heading)) if jitter.heading else 0.0
        n = left_normal(track.directions[0])
        return reset_at(
            track,
            track.start.x + n[0] * d_lat,
            track.start.y + n[1] * d_lat,
            track.start.heading + d_head,
            physics.start_speed + d_speed,
        )

    @property
    def world(self) -> WorldState:
        """The underlying pure sim state (read-only convenience for tools/tests)."""
        return self._world

    def _observe(self) -> Obs:
        sim = self.cfg.sim
        car = self._world.car
        rays = sense(self.track, self._world, sim)
        n = sim.rays.count
        obs = np.empty(self.cfg.observation.size(sim.rays), dtype=np.float32)
        for i, ray in enumerate(rays):
            obs[i] = ray.distance / sim.rays.max_length
        obs[n] = car.speed / sim.physics.v_max
        obs[n + 1] = self._a_lat / sim.physics.traction_accel_max
        obs[n + 2] = self._prev_action.steer
        obs[n + 3] = self._prev_action.drive
        return obs

    def _info(self, *, a_long: float, delta_s: float, lap_completed: bool) -> dict[str, Any]:
        w = self._world
        return {
            "tick": w.tick,
            "time": world_time(w, self.cfg.sim),
            "s": w.progress.s,
            "delta_s": delta_s,
            "speed": w.car.speed,
            "a_long": a_long,
            "a_lat": self._a_lat,
            "laps": w.laps,
            "lap_times": w.lap_times,
            "lap_completed": lap_completed,
            "crashed": w.crashed,
        }


def register_envs() -> None:
    """Register ``ApexDrive-v0`` with Gymnasium (idempotent)."""
    if ENV_ID not in gym.registry:
        gym.register(id=ENV_ID, entry_point="apex_trainer.env:ApexDriveEnv")


register_envs()
