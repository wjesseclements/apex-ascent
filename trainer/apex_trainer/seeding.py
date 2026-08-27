"""One place that seeds everything (CLAUDE.md trainer rule 5, SPEC §9).

``seed_everything(seed)`` seeds Python's ``random``, numpy, torch and SB3, turns
on torch's deterministic algorithms and pins the thread count. Env instances
are seeded separately (``env.reset(seed=seed + rank)``) and PPO gets
``seed=`` at construction; see ``train.py``.

Claim, stated precisely: evaluation is deterministic (same checkpoint + seed +
track ⇒ identical trajectory, pinned in tests). Training is seeded and
single-machine reproducible in practice; NOT claimed bit-identical across
machines or library versions, and a resumed run is not bit-identical to an
uninterrupted one (see ``runs.RESUME_NOTE``).
"""

from __future__ import annotations

import random

import numpy as np
import torch
from stable_baselines3.common.utils import set_random_seed


def seed_everything(seed: int, torch_threads: int = 1) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    set_random_seed(seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(torch_threads)
