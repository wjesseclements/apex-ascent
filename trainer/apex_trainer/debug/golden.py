"""Golden pin for the sim core: the scripted driver on Track A.

    uv run python -m apex_trainer.debug.golden --write   # regenerate (deliberately!)

Regeneration is a reviewed decision, never a side effect (CLAUDE.md testing
rule 3): if physics or geometry change, the old pin moves to a legacy config
rather than being overwritten silently.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from apex_trainer.config import DEFAULT_SIM
from apex_trainer.debug.rollout import rollout_scripted
from apex_trainer.tracks import TRACK_A, load_track

GOLDEN_PATH = Path(__file__).resolve().parents[2] / "tests" / "golden" / "scripted_track_a.json"
GOLDEN_TICKS = 1800  # 30 s: comfortably more than one lap
GOLDEN_SAMPLE_EVERY = 150  # 2.5 s: a dozen intermediate checkpoints along the run


def make_golden() -> dict[str, Any]:
    track = load_track(TRACK_A)
    samples, final = rollout_scripted(track, DEFAULT_SIM, GOLDEN_TICKS)
    picked = [s for s in samples if s.tick % GOLDEN_SAMPLE_EVERY == 0]
    return {
        "track": TRACK_A,
        "ticks": GOLDEN_TICKS,
        "config": DEFAULT_SIM.to_dict(),
        "crashed": final.crashed,
        "laps": final.laps,
        "lap_times": list(final.lap_times),
        "final": {
            "x": final.car.x,
            "y": final.car.y,
            "heading": final.car.heading,
            "speed": final.car.speed,
            "s": final.progress.s,
        },
        "samples": [
            {"tick": s.tick, "x": s.x, "y": s.y, "heading": s.heading, "speed": s.speed, "s": s.s}
            for s in picked
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="overwrite the committed pin")
    args = parser.parse_args(argv)
    data = make_golden()
    if args.write:
        GOLDEN_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN_PATH}")
    else:
        print(json.dumps({k: v for k, v in data.items() if k != "samples"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
