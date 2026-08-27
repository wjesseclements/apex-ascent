"""Run policies through ApexDrive-v0 episodes and summarize them.

Shared by the ``evaluate`` CLI (Slice 3), checkpoint evaluation (Slice 4) and
trajectory export (Slice 5).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from apex_trainer.config import env_config_from_dict
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import CheckpointPolicy, Policy
from apex_trainer.runs import RunPaths, checkpoint_path, latest_checkpoint, read_config_snapshot


@dataclass(frozen=True)
class EpisodeStats:
    steps: int
    crashed: bool
    truncated: bool
    laps: int
    lap_times: tuple[float, ...]
    total_reward: float
    distance: float
    """Centerline progress at the end of the episode, m (= s)."""
    mean_drive: float
    """Mean applied drive command over the episode: + throttle, − brake."""
    seed: int | None

    @property
    def best_lap(self) -> float | None:
        return min(self.lap_times) if self.lap_times else None


def run_episode(
    env: ApexDriveEnv, policy: Policy, seed: int | None = None, max_steps: int | None = None
) -> EpisodeStats:
    """One episode; ``max_steps`` caps it below the env's own truncation if given."""
    policy.reset(seed)
    obs, info = env.reset(seed=seed)
    total = 0.0
    drive_sum = 0.0
    steps = 0
    terminated = truncated = False
    limit = max_steps if max_steps is not None else env.cfg.episode.max_steps
    while steps < limit and not (terminated or truncated):
        action = policy.act(obs, env)
        obs, reward, terminated, truncated, info = env.step(action)
        total += reward
        drive_sum += float(max(-1.0, min(1.0, float(action[1]))))
        steps += 1
    return EpisodeStats(
        steps=steps,
        crashed=bool(info["crashed"]),
        truncated=bool(truncated or (steps >= limit and not terminated)),
        laps=int(info["laps"]),
        lap_times=tuple(info["lap_times"]),
        total_reward=total,
        distance=float(info["s"]),
        mean_drive=drive_sum / steps if steps else 0.0,
        seed=seed,
    )


def format_episode(index: int, st: EpisodeStats) -> str:
    end = "crashed" if st.crashed else ("truncated" if st.truncated else "ended")
    laps = ", ".join(f"{t:.2f} s" for t in st.lap_times) if st.lap_times else "none"
    return (
        f"episode {index}: {st.steps} steps, {end}, laps {st.laps} ({laps}), "
        f"return {st.total_reward:.1f}, distance {st.distance:.1f} m, "
        f"mean drive {st.mean_drive:+.2f}"
    )


def format_summary(policy: str, track: str, stats: list[EpisodeStats]) -> str:
    n = len(stats)
    crashes = sum(1 for s in stats if s.crashed)
    mean_return = sum(s.total_reward for s in stats) / n
    mean_distance = sum(s.distance for s in stats) / n
    mean_drive = sum(s.mean_drive for s in stats) / n
    laps = [t for s in stats for t in s.lap_times]
    best = f"{min(laps):.2f} s" if laps else "none"
    return (
        f"summary: {policy} on {track}, {n} episode(s): crash rate {crashes}/{n}, "
        f"mean return {mean_return:.1f}, mean distance {mean_distance:.1f} m, "
        f"mean drive {mean_drive:+.2f}, best lap {best}"
    )


def stats_to_dict(st: EpisodeStats) -> dict[str, Any]:
    return {**asdict(st), "best_lap": st.best_lap}


def evaluate_checkpoint(
    paths: RunPaths,
    *,
    checkpoint_steps: int | None,
    track: str | None,
    episodes: int,
    seed: int,
    max_steps: int | None = None,
) -> tuple[Path, list[EpisodeStats], str]:
    """Deterministic evaluation of one checkpoint; writes eval/<steps>-<track>.json.

    Returns (json path, per-episode stats, track used). ``track=None`` means the
    run's training track; ``checkpoint_steps=None`` means the latest checkpoint.
    """
    snap = read_config_snapshot(paths)
    track_name = track or str(snap["track"])
    env_cfg = env_config_from_dict(snap["env"])
    if checkpoint_steps is None:
        latest = latest_checkpoint(paths)
        if latest is None:
            raise FileNotFoundError(f"no checkpoints in {paths.checkpoints_dir}")
        checkpoint_steps, ckpt = latest
    else:
        ckpt = checkpoint_path(paths, checkpoint_steps)
        if not ckpt.exists():
            raise FileNotFoundError(f"no checkpoint at {checkpoint_steps} steps: {ckpt}")
    env = ApexDriveEnv(track_name, env_cfg)
    policy = CheckpointPolicy(ckpt, name=f"ppo@{checkpoint_steps}")
    stats = [run_episode(env, policy, seed=seed + i, max_steps=max_steps) for i in range(episodes)]
    out = paths.eval_dir / f"{checkpoint_steps}-{track_name}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "run_id": paths.run_id,
                "checkpoint_steps": checkpoint_steps,
                "track": track_name,
                "seed": seed,
                "episodes": [stats_to_dict(s) for s in stats],
                "summary": format_summary(policy.name, track_name, stats),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return out, stats, track_name
