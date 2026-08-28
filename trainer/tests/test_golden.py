"""Tripwire: the scripted driver's Track A run must match the committed pin.

Tolerances are deliberate. ``math.sin``/``math.cos`` come from the platform
libm and can differ in the last ulp between macOS (where the pin was made) and
Linux CI; 1800 ticks of closed-loop control can amplify that. 1 mm / 1 mm/s /
1e-6 rad is far above any such drift yet far below what any real change to
physics, geometry, progress or the driver would cause (metres, not millimetres).
Exact equality would make the pin a platform test, not a physics test.
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest

from apex_trainer.config import DEFAULT_SIM, PHYSICS_PRESETS
from apex_trainer.debug.golden import GOLDEN_TICKS, golden_path, make_golden

POS_TOL = 1e-3  # m
SPEED_TOL = 1e-3  # m/s
HEADING_TOL = 1e-6  # rad
LAP_TIME_TOL = DEFAULT_SIM.physics.dt / 2  # lap times are tick multiples: same tick or fail


@pytest.mark.parametrize("preset", ["default", "low-drag", "no-drag"])
def test_scripted_track_a_matches_golden_pin(preset: str) -> None:
    pinned = json.loads(golden_path(preset).read_text(encoding="utf-8"))
    expected_cfg = replace(DEFAULT_SIM, physics=PHYSICS_PRESETS[preset]).to_dict()
    assert pinned["config"] == expected_cfg, (
        "config drifted from the pin: move the old pin to a legacy config, don't overwrite"
    )
    assert pinned["ticks"] == GOLDEN_TICKS
    actual = make_golden(preset)

    assert actual["crashed"] == pinned["crashed"] is False
    assert actual["laps"] == pinned["laps"] >= 1
    assert actual["lap_times"] == pytest.approx(pinned["lap_times"], abs=LAP_TIME_TOL)

    for key, tol in (("x", POS_TOL), ("y", POS_TOL), ("speed", SPEED_TOL), ("s", POS_TOL)):
        assert actual["final"][key] == pytest.approx(pinned["final"][key], abs=tol), key
    assert actual["final"]["heading"] == pytest.approx(pinned["final"]["heading"], abs=HEADING_TOL)

    assert len(actual["samples"]) == len(pinned["samples"])
    for got, want in zip(actual["samples"], pinned["samples"], strict=True):
        assert got["tick"] == want["tick"]
        assert got["x"] == pytest.approx(want["x"], abs=POS_TOL), want["tick"]
        assert got["y"] == pytest.approx(want["y"], abs=POS_TOL), want["tick"]
        assert got["s"] == pytest.approx(want["s"], abs=POS_TOL), want["tick"]
