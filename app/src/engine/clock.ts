/**
 * How the playback clock advances, as pure arithmetic (ported from
 * f1-telemetry-replay). The live clock lives in a ref inside the render loop
 * (CLAUDE.md app rule 1); this file holds the rule for moving it so the
 * discipline is unit-testable instead of buried in a rAF callback.
 *
 * - Scaled deltas accumulate: `clock += dt · speedMult`. Deriving the clock
 *   from an absolute timestamp would rescale already-elapsed time when the
 *   speed changes and teleport the car.
 * - `dt` is clamped: a backgrounded tab resumes with a huge frame delta.
 */
import { wrapClock } from './trajectory';

/** Largest frame delta honoured, seconds (generous vs 16 ms frames, tiny vs a hidden tab). */
export const MAX_FRAME_DT_S = 0.1;

/** Elapsed seconds between two rAF timestamps, clamped; 0 on the first frame or non-positive. */
export function frameDelta(prevMs: number | null, nowMs: number): number {
  if (prevMs === null) return 0;
  const dt = (nowMs - prevMs) / 1000;
  if (!(dt > 0)) return 0; // also catches NaN
  return Math.min(dt, MAX_FRAME_DT_S);
}

/** The clock one frame later, folded into [0, duration). */
export function advanceClock(clock: number, dt: number, speedMult: number, dur: number): number {
  return wrapClock(clock + dt * speedMult, dur);
}
