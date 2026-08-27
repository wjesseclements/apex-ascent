"""Baseline policies through the env: the numbers the Slice 3 demo quotes."""

from __future__ import annotations

import pytest

from apex_trainer.config import DEFAULT_SIM
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import run_episode
from apex_trainer.policies import RANDOM_THROTTLE_MIN, make_policy
from apex_trainer.tracks import TRACK_A, TRACK_B


@pytest.mark.parametrize("track", [TRACK_A, TRACK_B])
def test_scripted_policy_completes_two_laps_in_60s(track: str) -> None:
    st = run_episode(ApexDriveEnv(track), make_policy("scripted"), seed=0)
    assert not st.crashed and st.truncated and st.steps == 3600
    assert st.laps == 2 and len(st.lap_times) == 2
    assert st.total_reward == pytest.approx(st.distance)  # no crash ⇒ return is pure progress
    assert 0.0 < st.mean_drive <= 1.0
    assert st.best_lap is not None and 18.83 < st.best_lap < 40.0


def test_scripted_policy_is_deterministic_across_seeds() -> None:
    env = ApexDriveEnv(TRACK_A)
    a = run_episode(env, make_policy("scripted"), seed=0, max_steps=600)
    b = run_episode(env, make_policy("scripted"), seed=99, max_steps=600)
    assert a.distance == b.distance and a.total_reward == b.total_reward


@pytest.mark.parametrize("seed", [0, 1, 2])
def test_random_throttle_crashes_fast(seed: int) -> None:
    st = run_episode(ApexDriveEnv(TRACK_A), make_policy("random-throttle"), seed=seed)
    assert st.crashed and not st.truncated
    assert st.steps * DEFAULT_SIM.physics.dt < 10.0
    assert st.mean_drive >= RANDOM_THROTTLE_MIN
    assert st.total_reward == pytest.approx(st.distance - 10.0)


@pytest.mark.parametrize("seed", [0, 1, 2])
def test_uniform_random_dithers_on_the_start_line(seed: int) -> None:
    # The Slice 3 finding, pinned: uniform random actions average to ~zero drive and,
    # with brake (20) > throttle (12), the car crawls a few metres and never crashes.
    st = run_episode(ApexDriveEnv(TRACK_A), make_policy("random"), seed=seed, max_steps=600)
    assert not st.crashed and st.truncated
    assert st.distance < 15.0
    assert abs(st.mean_drive) < 0.15


def test_random_policies_are_seed_reproducible() -> None:
    env = ApexDriveEnv(TRACK_A)
    a = run_episode(env, make_policy("random-throttle"), seed=5)
    b = run_episode(env, make_policy("random-throttle"), seed=5)
    c = run_episode(env, make_policy("random-throttle"), seed=6)
    assert a == b
    assert a.steps != c.steps or a.distance != c.distance


def test_unknown_policy_name() -> None:
    with pytest.raises(ValueError, match="unknown policy"):
        make_policy("ppo")
