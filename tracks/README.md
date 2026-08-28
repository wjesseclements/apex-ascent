# tracks/

Track definitions shared by the trainer (Python) and the app (TypeScript).
This directory is the single source of truth: neither half embeds track data.

| file | name | centerline | length | direction | origin |
|---|---|---|---|---|---|
| `track_a.json` | Track A — training | 111 pts | 439.6 m | clockwise (right-handers) | apex-evolve `training.json` |
| `track_a_mirror.json` | Track A mirrored | 111 pts | 439.6 m | counter-clockwise (left-handers) | generated: `uv run python -m apex_trainer.debug.mirror_track` (y negated) |
| `track_b.json` | Track B — generalization | 128 pts | 509.1 m | counter-clockwise (left-handers) | apex-evolve `heldout.json` |

## Format

```json
{
  "name": "track_a",
  "width": 12,
  "centerline": [[0, 0], [4, 0], ...]
}
```

- `name` — non-empty string identifier (used as `trackId` in trajectory files).
- `width` — full track width in meters; the drivable surface extends
  `width / 2` either side of the centerline.
- `centerline` — closed polyline of `[x, y]` points in meters, listed in the
  **direction of travel**. The loop is implicit: the last point connects back
  to the first (no duplicated vertex). At least 3 points; no two consecutive
  points may coincide; corners must not be so sharp that the width/2 offset
  edges would cross (the loader rejects all of these with a clear error).
- The start/finish line is at `centerline[0]`, perpendicular to segment 0;
  cars start there facing along segment 0. Arc-length `s` is measured from it.

## Coordinate frame

SPEC §3.3: **x right, y up**, meters, angles counter-clockwise from +x.

apex-evolve authored its tracks screen-native (**y down**). The files here
were converted once at copy time by negating every `y` (`scripts` not needed;
it was a one-line transform, recorded here for provenance). Because the app's
canvas layer flips y for the screen, the tracks render *identically* to
apex-evolve, and corner handedness is preserved: Track A is still driven
clockwise with right-handers, exactly as the GA drove it. The trainer never
thinks about screens.

## Derived geometry (computed by the loader, not stored)

Left/right edges are the centerline offset by `width / 2` along the mitered
vertex normal (so both edges stay exactly `width / 2` from the adjacent
segments); per-segment arc-length tables; the start pose; bounds. The same
construction apex-evolve used, so the shapes match.
