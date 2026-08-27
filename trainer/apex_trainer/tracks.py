"""Loading tracks from ``tracks/*.json`` (the only IO around track geometry)."""

from __future__ import annotations

import json
from pathlib import Path

from apex_trainer.sim.track import Track, build_track, parse_track_data

TRACKS_DIR = Path(__file__).resolve().parents[2] / "tracks"

TRACK_A = "track_a"
TRACK_B = "track_b"


def track_path(name: str) -> Path:
    return TRACKS_DIR / f"{name}.json"


def load_track(name: str) -> Track:
    """Load, validate and build ``tracks/<name>.json``."""
    with track_path(name).open(encoding="utf-8") as f:
        raw: object = json.load(f)
    return build_track(parse_track_data(raw))


def available_tracks() -> list[str]:
    return sorted(p.stem for p in TRACKS_DIR.glob("*.json"))
