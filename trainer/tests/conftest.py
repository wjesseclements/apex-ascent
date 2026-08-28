"""Shared fixtures: the real tracks, loaded once per session.

Property sweeps run over BOTH tracks (CLAUDE.md testing rule 1: real geometry,
not toy examples); parametrize with ``all_tracks``.
"""

from __future__ import annotations

import pytest

from apex_trainer.sim.track import Track
from apex_trainer.tracks import TRACK_A, TRACK_B, load_track

TRACK_NAMES = (TRACK_A, "track_a_mirror", TRACK_B)


@pytest.fixture(scope="session")
def track_a() -> Track:
    return load_track(TRACK_A)


@pytest.fixture(scope="session")
def track_b() -> Track:
    return load_track(TRACK_B)


@pytest.fixture(scope="session", params=TRACK_NAMES)
def any_track(request: pytest.FixtureRequest) -> Track:
    name: str = request.param
    return load_track(name)
