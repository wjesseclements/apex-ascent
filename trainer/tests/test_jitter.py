"""Start jitter (Slice 6): off by default, seeded and reproducible when on, and the
clean-lap accounting that makes a jittered evaluation meaningful."""

from __future__ import annotations

import math
from dataclasses import replace

import numpy as np
import pytest

from apex_trainer.config import (
    DEFAULT_ENV,
    DEFAULT_EVAL_JITTER,
    EnvConfig,
    EpisodeConfig,
    StartJitter,
    env_config_from_dict,
)
from apex_trainer.env import ApexDriveEnv
from apex_trainer.evaluate import EpisodeStats, format_summary, run_episode
from apex_trainer.policies import make_policy
from apex_trainer.sim.containment import is_inside_track
from apex_trainer.tracks import TRACK_A

JITTERED = EnvConfig(episode=EpisodeConfig(start_jitter=DEFAULT_EVAL_JITTER))


def test_default_start_is_deterministic_and_jitter_is_off() -> None:
    assert not DEFAULT_ENV.episode.start_jitter.enabled
    env = ApexDriveEnv(TRACK_A)
    a, _ = env.reset(seed=1)
    b, _ = env.reset(seed=2)
    assert np.array_equal(a, b)
    assert env.world.car.speed == 2.0 and (env.world.car.x, env.world.car.y) == (0.0, 0.0)


def test_jittered_start_is_seeded_reproducible_and_bounded() -> None:
    env = ApexDriveEnv(TRACK_A, JITTERED)
    starts = []
    for seed in (0, 1, 2, 3, 4, 5, 6, 7):
        env.reset(seed=seed)
        w = env.world
        starts.append((w.car.x, w.car.y, w.car.heading, w.car.speed))
        j = DEFAULT_EVAL_JITTER
        assert abs(w.car.y) <= j.lateral + 1e-9  # segment 0 runs along +x: lateral is y
        assert abs(w.car.x) < 1e-9
        assert abs(w.car.heading) <= j.heading + 1e-12
        assert 2.0 - j.speed <= w.car.speed <= 2.0 + j.speed
        assert is_inside_track(env.track, (w.car.x, w.car.y)).inside
        assert not w.crashed and abs(w.progress.s) < 1.0  # near the line, either side
    assert len(set(starts)) == len(starts)  # different seeds → different starts
    env.reset(seed=3)
    w = env.world
    assert (w.car.x, w.car.y, w.car.heading, w.car.speed) == starts[3]


def test_jitter_survives_the_config_snapshot() -> None:
    d = JITTERED.to_dict()
    assert d["episode"]["start_jitter"]["heading"] == pytest.approx(math.radians(5))
    assert env_config_from_dict(d) == JITTERED
    # old snapshots without the field still load, jitter off
    d["episode"].pop("start_jitter")
    assert env_config_from_dict(d).episode.start_jitter == StartJitter()


def test_scripted_driver_survives_jittered_starts() -> None:
    env = ApexDriveEnv(TRACK_A, JITTERED)
    stats = [run_episode(env, make_policy("scripted"), seed=s, max_steps=1800) for s in range(3)]
    assert all(not s.crashed and s.laps >= 1 for s in stats)
    distances = {round(s.distance, 3) for s in stats}
    assert len(distances) == 3  # the jitter actually changed the episodes


def test_clean_lap_accounting() -> None:
    def st(laps: int, crashed: bool, truncated: bool) -> EpisodeStats:
        return EpisodeStats(
            steps=1,
            crashed=crashed,
            truncated=truncated,
            laps=laps,
            lap_times=tuple(20.0 for _ in range(laps)),
            total_reward=0.0,
            distance=0.0,
            mean_drive=0.0,
            seed=0,
        )

    assert st(3, False, True).laps_attempted == 3  # truncation: unfinished lap not an attempt
    assert st(2, True, False).laps_attempted == 3  # crash: the lap in progress was attempted
    assert st(0, True, False).laps_attempted == 1
    assert st(0, False, True).laps_attempted == 0
    summary = format_summary("p", "t", [st(3, False, True), st(2, True, False), st(0, True, False)])
    assert "clean laps 5/7 (71%)" in summary
    assert "clean laps 0/0," in format_summary("p", "t", [st(0, False, True)])


def test_jitter_config_replace_helper_is_frozen() -> None:
    cfg = replace(
        DEFAULT_ENV, episode=replace(DEFAULT_ENV.episode, start_jitter=StartJitter(speed=0.5))
    )
    assert cfg.episode.start_jitter.enabled and cfg.episode.max_steps == 3600
