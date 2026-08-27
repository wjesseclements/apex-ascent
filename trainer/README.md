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
