"""The committed reproduction runs evaluate to the numbers FINDINGS.md quotes.

Tolerances: a 60 s closed-loop episode fed through torch on another CPU can
drift in the last ulp and, through the policy, change a lap time by a few
hundredths; laps completed and the clean/crash outcome are the robust claims.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from apex_trainer.config import DEFAULT_EVAL_JITTER
from apex_trainer.evaluate import evaluate_checkpoint
from apex_trainer.runs import list_checkpoints, open_run, read_config_snapshot

COMMITTED = Path(__file__).resolve().parents[1] / "runs-committed"
LAP_TOL = 0.2  # s


def test_committed_runs_are_complete_and_describe_themselves() -> None:
    e7 = open_run(COMMITTED / "e7")
    assert [s for s, _ in list_checkpoints(e7)] == [8_000_000, 13_000_000]
    snap = read_config_snapshot(e7)
    assert snap["ppo"]["gamma"] == 0.995 and snap["env"]["sim"]["physics"]["drag"] == 0.3
    e8 = open_run(COMMITTED / "e8a-lowdrag")
    assert [s for s, _ in list_checkpoints(e8)] == [5_013_504]
    assert read_config_snapshot(e8)["env"]["sim"]["physics"]["drag"] == 0.05


def test_generalist_laps_track_b_from_track_a_training(tmp_path: Path) -> None:
    _, stats, track = evaluate_checkpoint(
        open_run(COMMITTED / "e7"), checkpoint_steps=8_000_000, track="track_b", episodes=1, seed=0
    )
    st = stats[0]
    assert track == "track_b" and not st.crashed and st.laps == 3
    assert st.best_lap == pytest.approx(18.98, abs=LAP_TOL)


def test_specialist_is_fastest_on_a_and_crashes_on_b() -> None:
    e7 = open_run(COMMITTED / "e7")
    _, a, _ = evaluate_checkpoint(
        e7, checkpoint_steps=13_000_000, track="track_a", episodes=1, seed=0
    )
    assert not a[0].crashed and a[0].best_lap == pytest.approx(15.80, abs=LAP_TOL)
    _, b, _ = evaluate_checkpoint(
        e7, checkpoint_steps=13_000_000, track="track_b", episodes=1, seed=0
    )
    assert b[0].crashed


def test_low_drag_checkpoint_brakes() -> None:
    _, stats, _ = evaluate_checkpoint(
        open_run(COMMITTED / "e8a-lowdrag"),
        checkpoint_steps=5_013_504,
        track="track_a",
        episodes=3,
        seed=0,
        jitter=DEFAULT_EVAL_JITTER,
    )
    assert all(not s.crashed for s in stats)
    assert min(s.best_lap or 99 for s in stats) == pytest.approx(15.17, abs=LAP_TOL)
    assert all(s.mean_drive < 0.7 for s in stats)  # it lifts and brakes; the SPEC car sits at +0.94
