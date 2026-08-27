# trainer

Python half of apex-ascent: the pure sim core, the Gymnasium environment, PPO
training with Stable-Baselines3, evaluation, and trajectory export.

```
uv sync                      # create .venv and install (locked)
uv run pytest                # tests
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run evaluate --policy scripted|random|random-throttle [--track track_b] [--episodes N] [--seed S]
uv run train --steps N [--resume runs/<id>]     # Slice 4
uv run evaluate runs/<id> [--checkpoint N]      # Slice 4
uv run tensorboard                              # Slice 4
```

The command surface above is declared from day one; commands that belong to a
later slice say so and exit non-zero until that slice lands.

## Env throughput benchmark (Slice 4, `uv run python -m apex_trainer.bench`)

Raw env steps/s with a random-throttle action stream, 16-core Apple M-series,
Python 3.12 (collection side only; PPO's update cost comes on top):

| vec_env | n_envs | steps/s |
|---|---|---|
| dummy | 1 | 12.6k |
| dummy | 8 | 14.1k |
| subproc | 8 | **30.3k** |
| dummy | 16 | 14.0k |
| subproc | 16 | 37.8k |

`TrainConfig.vec_env` defaults to `subproc` with 8 envs.

## Determinism, stated precisely (SPEC §9)

- **Evaluation** is deterministic: same checkpoint + seed + track ⇒ identical
  trajectory (bit-equal on one machine, pinned in tests).
- **Training** is seeded end-to-end (numpy, torch, SB3, every env) with torch
  deterministic algorithms and one thread; same seed twice on one machine gives
  identical weights (tested). It is **not** claimed bit-identical across
  machines or library versions.
- **Resume** restores network weights and the step counter, not mid-stream RNG
  state: a resumed run is not bit-identical to an uninterrupted run of the same
  total steps. Recorded in every run's `metadata.json`.
