"""ApexDrive-v0: API compliance, observation ranges, reward magnitudes, episode rules."""

from __future__ import annotations

import random
from typing import Any

import gymnasium as gym
import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from apex_trainer.config import DEFAULT_ENV, DEFAULT_SIM, EnvConfig, EpisodeConfig
from apex_trainer.env import ENV_ID, ApexDriveEnv
from apex_trainer.sim.scripted import DEFAULT_SCRIPTED, scripted_action
from apex_trainer.sim.track import point_at_arc
from apex_trainer.sim.world import sense
from apex_trainer.tracks import TRACK_A, TRACK_B, load_track

# One scripted lap's rewards sum to exactly L (projection) up to Δs rounding per tick.
LAP_SUM_TOL = 1e-3
SPEED_STEP_TOL = 1e-9


def _scripted(env: ApexDriveEnv) -> np.ndarray:
    a = scripted_action(
        sense(env.track, env.world, env.cfg.sim), env.world.car.speed, env.cfg.sim, DEFAULT_SCRIPTED
    )
    return np.array([a.steer, a.drive], dtype=np.float32)


def _run(env: ApexDriveEnv, policy: str, max_steps: int, seed: int = 0) -> list[dict[str, Any]]:
    """Roll out; returns per-step records (obs, reward, terminated, truncated, info)."""
    rng = random.Random(seed)
    env.reset(seed=seed)
    records: list[dict[str, Any]] = []
    for _ in range(max_steps):
        if policy == "scripted":
            action = _scripted(env)
        else:  # throttle-on random steering: exercises the crash path quickly
            action = np.array([rng.uniform(-1, 1), rng.uniform(0.2, 1)], dtype=np.float32)
        obs, reward, terminated, truncated, info = env.step(action)
        records.append(
            {
                "obs": obs,
                "reward": reward,
                "terminated": terminated,
                "truncated": truncated,
                "info": info,
                "action": action,
            }
        )
        if terminated or truncated:
            break
    return records


@pytest.fixture(params=(TRACK_A, TRACK_B))
def env(request: pytest.FixtureRequest) -> ApexDriveEnv:
    name: str = request.param
    return ApexDriveEnv(name)


def test_check_env_passes(env: ApexDriveEnv) -> None:
    check_env(env, skip_render_check=True)


def test_registered_with_gymnasium() -> None:
    made = gym.make(ENV_ID)
    assert isinstance(made.unwrapped, ApexDriveEnv)
    obs, _ = made.reset(seed=1)
    assert obs.shape == (16,)


def test_spaces_and_layout(env: ApexDriveEnv) -> None:
    assert env.observation_space.shape == (DEFAULT_ENV.observation.size(DEFAULT_SIM.rays),)
    assert env.observation_space.dtype == np.float32
    assert env.action_space.shape == (2,)
    obs, info = env.reset(seed=0)
    assert obs.dtype == np.float32
    assert env.observation_space.contains(obs)
    assert obs[12] == pytest.approx(DEFAULT_SIM.physics.start_speed / DEFAULT_SIM.physics.v_max)
    assert obs[13] == 0.0 and obs[14] == 0.0 and obs[15] == 0.0
    assert info["tick"] == 0 and info["s"] == 0.0 and not info["crashed"]


@pytest.mark.parametrize("policy", ["scripted", "random-throttle"])
def test_observations_stay_within_documented_ranges(env: ApexDriveEnv, policy: str) -> None:
    for rec in _run(env, policy, 3600):
        obs = rec["obs"]
        assert obs.dtype == np.float32
        assert np.all(np.isfinite(obs))
        assert env.observation_space.contains(obs), obs
        assert np.all(obs[:12] >= 0) and np.all(obs[:12] <= 1)
        assert 0 <= obs[12] <= 1 and -1 <= obs[13] <= 1
        assert np.allclose(obs[14:16], np.clip(rec["action"], -1, 1))  # prev applied action


def test_reward_per_step_at_25_mps_is_about_0_42() -> None:
    # SPEC §5 magnitude check, exact form: Δs = v·dt along a straight.
    env = ApexDriveEnv(TRACK_A)
    env.reset(seed=0)
    # Drive straight down the 80 m start straight until ~25 m/s, then measure.
    for _ in range(400):
        _, reward, terminated, _, info = env.step(np.array([0.0, 1.0], dtype=np.float32))
        assert not terminated
        if info["speed"] >= 25.0:
            break
    assert 25.0 <= info["speed"] < 26.0
    _, reward, _, _, info = env.step(np.array([0.0, 0.0], dtype=np.float32))
    assert reward == pytest.approx(info["speed"] * DEFAULT_SIM.physics.dt, abs=SPEED_STEP_TOL)
    assert 0.40 < reward < 0.44


def test_one_scripted_lap_sums_to_the_track_length(env: ApexDriveEnv) -> None:
    # Rewards up to and including the crossing tick sum to the progress s at that tick:
    # at least L, and less than L plus one tick of travel (the overshoot past the line).
    total = 0.0
    for rec in _run(env, "scripted", 3600):
        total += rec["reward"]
        if rec["info"]["lap_completed"]:
            break
    else:
        pytest.fail("scripted driver did not complete a lap")
    L = env.track.total_length
    assert total == pytest.approx(rec["info"]["s"], abs=LAP_SUM_TOL)
    assert L <= total < L + DEFAULT_SIM.physics.v_max * DEFAULT_SIM.physics.dt


def test_crash_is_terminal_with_penalty_and_matches_out_of_bounds(env: ApexDriveEnv) -> None:
    records = _run(env, "random-throttle", 3600, seed=3)
    last = records[-1]
    assert last["terminated"] and not last["truncated"]
    assert last["info"]["crashed"]
    assert last["reward"] == pytest.approx(
        last["info"]["delta_s"] - DEFAULT_ENV.reward.crash_penalty
    )
    for rec in records[:-1]:
        assert not rec["terminated"] and not rec["info"]["crashed"]
    assert len(records) < 600  # the wall is real: a wild driver dies within 10 s


def test_truncation_at_max_steps_and_laps_do_not_terminate(env: ApexDriveEnv) -> None:
    records = _run(env, "scripted", 5000)
    assert len(records) == DEFAULT_ENV.episode.max_steps
    last = records[-1]
    assert last["truncated"] and not last["terminated"]
    assert last["info"]["laps"] >= 2  # 60 s is enough for two scripted laps
    assert len(last["info"]["lap_times"]) == last["info"]["laps"]
    assert sum(1 for r in records if r["info"]["lap_completed"]) == last["info"]["laps"]


def test_custom_max_steps() -> None:
    env = ApexDriveEnv(TRACK_A, EnvConfig(episode=EpisodeConfig(max_steps=50)))
    records = _run(env, "scripted", 500)
    assert len(records) == 50 and records[-1]["truncated"]


def test_driving_backwards_is_negative_and_oscillation_nets_zero() -> None:
    # Reward-hacking watch (SPEC §5): the projection cannot be farmed.
    env = ApexDriveEnv(TRACK_A)
    env.reset(seed=0)
    track = env.track
    # Teleport-free check via the sim's own progress: compare arc positions along a
    # back-and-forth path across the projection using the world helper.
    from apex_trainer.sim.progress import initial_progress, update_progress

    st = initial_progress(track, point_at_arc(track, 50.0)[0])
    total = 0.0
    for k in range(1, 41):
        s = 50.0 + (0.3 if k % 2 else -0.3)
        st, d = update_progress(track, st, point_at_arc(track, s)[0])
        total += d
    _, d = update_progress(track, st, point_at_arc(track, 50.0)[0])  # back to the start
    total += d
    assert abs(total) < 1e-9
    st = initial_progress(track, point_at_arc(track, 50.0)[0])
    _, d = update_progress(track, st, point_at_arc(track, 49.0)[0])
    assert d == pytest.approx(-1.0)


def test_same_action_tape_gives_identical_observations(env: ApexDriveEnv) -> None:
    a = _run(env, "random-throttle", 300, seed=7)
    b = _run(env, "random-throttle", 300, seed=7)
    assert len(a) == len(b)
    for ra, rb in zip(a, b, strict=True):
        assert np.array_equal(ra["obs"], rb["obs"])
        assert ra["reward"] == rb["reward"]


def test_actions_are_clamped_before_use(env: ApexDriveEnv) -> None:
    env.reset(seed=0)
    obs, *_ = env.step(np.array([7.0, -9.0], dtype=np.float32))
    assert obs[14] == 1.0 and obs[15] == -1.0


def test_observation_version_is_pinned() -> None:
    assert DEFAULT_ENV.observation.version == "v0"
    assert DEFAULT_ENV.to_dict()["observation"]["version"] == "v0"
    assert load_track(TRACK_A).name == TRACK_A
