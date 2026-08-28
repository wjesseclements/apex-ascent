"""Generate tracks/track_a_mirror.json: Track A with y negated — the same circuit
driven as left-handers (Track A is all right-handers). Used to separate "learned
right-handers" from "memorized Track A" (Slice 6 E5).

    uv run python -m apex_trainer.debug.mirror_track
"""

from __future__ import annotations

import json

from apex_trainer.tracks import TRACK_A, track_path

MIRROR_NAME = "track_a_mirror"


def main() -> int:
    src = json.loads(track_path(TRACK_A).read_text(encoding="utf-8"))
    pts = [[x, (-y if y else 0)] for x, y in src["centerline"]]
    lines = [
        "{",
        f'  "name": "{MIRROR_NAME}",',
        f'  "width": {json.dumps(src["width"])},',
        '  "centerline": [',
    ]
    for i, (x, y) in enumerate(pts):
        lines.append(f"    [{json.dumps(x)}, {json.dumps(y)}]{',' if i < len(pts) - 1 else ''}")
    lines += ["  ]", "}", ""]
    out = track_path(MIRROR_NAME)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} ({len(pts)} points)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
