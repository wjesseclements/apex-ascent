"""SB3 callbacks: driving-specific metrics into TensorBoard.

SB3 logs episode reward/length itself (``rollout/ep_rew_mean``). We add what a
racing engineer wants to see per rollout: lap times, laps per episode, crash
rate, distance, mean drive — averaged over the episodes that finished during
the rollout.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from stable_baselines3.common.callbacks import BaseCallback


class LapMetricsCallback(BaseCallback):
    def __init__(self, verbose: int = 0) -> None:
        super().__init__(verbose)
        self._drive_sum: np.ndarray = np.zeros(0)
        self._drive_n: np.ndarray = np.zeros(0)
        self._finished: list[dict[str, Any]] = []

    def _on_training_start(self) -> None:
        n = self.training_env.num_envs
        self._drive_sum = np.zeros(n)
        self._drive_n = np.zeros(n)

    def _on_step(self) -> bool:
        actions = np.asarray(self.locals["actions"])
        drive = np.clip(actions[:, 1], -1.0, 1.0)
        self._drive_sum += drive
        self._drive_n += 1
        for i, (done, info) in enumerate(
            zip(self.locals["dones"], self.locals["infos"], strict=True)
        ):
            if not done:
                continue
            self._finished.append(
                {
                    "laps": int(info["laps"]),
                    "lap_times": list(info["lap_times"]),
                    "crashed": bool(info["crashed"]),
                    "distance": float(info["s"]),
                    "mean_drive": float(self._drive_sum[i] / max(self._drive_n[i], 1)),
                }
            )
            self._drive_sum[i] = 0.0
            self._drive_n[i] = 0.0
        return True

    def _on_rollout_end(self) -> None:
        eps = self._finished
        if not eps:
            return
        laps = [t for e in eps for t in e["lap_times"]]
        self.logger.record("rollout/episodes_finished", len(eps))
        self.logger.record("rollout/crash_rate", float(np.mean([e["crashed"] for e in eps])))
        self.logger.record("rollout/distance_mean", float(np.mean([e["distance"] for e in eps])))
        self.logger.record("rollout/laps_per_episode", float(np.mean([e["laps"] for e in eps])))
        self.logger.record("rollout/mean_drive", float(np.mean([e["mean_drive"] for e in eps])))
        if laps:
            self.logger.record("rollout/lap_time_mean", float(np.mean(laps)))
            self.logger.record("rollout/lap_time_best", float(np.min(laps)))
        self._finished = []
