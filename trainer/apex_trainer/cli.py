"""Console entry points declared in pyproject.toml.

Each command exists from Slice 1 so the command surface in CLAUDE.md is stable;
commands whose slice has not landed yet say so and exit with status 2.
"""

from __future__ import annotations

import sys

_NOT_YET = "{name}: not implemented until Slice {slice} (see SLICES.md)"


def _not_yet(name: str, slice_number: int) -> int:
    print(_NOT_YET.format(name=name, slice=slice_number), file=sys.stderr)
    return 2


def train() -> int:
    """Train PPO on the driving env; lands in Slice 4."""
    return _not_yet("train", 4)


def evaluate() -> int:
    """Evaluate a policy deterministically and export trajectories; lands in Slice 3."""
    return _not_yet("evaluate", 3)


def tensorboard() -> int:
    """Launch TensorBoard on the runs directory; lands in Slice 4."""
    return _not_yet("tensorboard", 4)
