"""Benchmark env throughput: DummyVecEnv vs SubprocVecEnv at several n_envs.

    uv run python -m apex_trainer.bench [--steps 4000]

Measures raw env steps/s with a fixed random-throttle action stream (no
learning), which is the collection side of PPO's cost. The result picks
``TrainConfig.vec_env``'s default; numbers are recorded in trainer/README.md.
"""

from __future__ import annotations

import argparse
import time

import numpy as np

from apex_trainer.config import DEFAULT_ENV
from apex_trainer.train import make_vec_env


def bench(kind: str, n_envs: int, steps: int, seed: int = 0) -> float:
    vec = make_vec_env(("track_a",), DEFAULT_ENV, n_envs, seed, kind)
    rng = np.random.default_rng(seed)
    try:
        vec.reset()
        t0 = time.perf_counter()
        for _ in range(steps // n_envs):
            actions = np.stack(
                [rng.uniform(-1, 1, size=n_envs), rng.uniform(0.2, 1, size=n_envs)], axis=1
            ).astype(np.float32)
            vec.step(actions)
        elapsed = time.perf_counter() - t0
    finally:
        vec.close()
    return (steps // n_envs) * n_envs / elapsed


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--steps", type=int, default=4000, help="env steps per configuration")
    args = p.parse_args(argv)
    print(f"{'vec_env':8s} {'n_envs':>6s} {'steps/s':>10s}")
    for n_envs in (1, 8, 16):
        for kind in ("dummy", "subproc"):
            if kind == "subproc" and n_envs == 1:
                continue
            rate = bench(kind, n_envs, args.steps)
            print(f"{kind:8s} {n_envs:6d} {rate:10.0f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
