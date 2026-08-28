/** Port of `sim/progress.py`: unwrapped arc-length progress via projection. */
import { nearestSegment } from './containment';
import type { Track } from '../track';

export interface ProgressState {
  readonly s: number;
  readonly segment: number;
}

export function arcPosition(
  track: Track,
  p: readonly [number, number],
  hint: number | null = null,
): [number, number] {
  const near = nearestSegment(track, p, hint);
  let arc = track.segmentStart[near.index]! + near.t * track.segmentLengths[near.index]!;
  if (arc >= track.totalLength) arc -= track.totalLength;
  return [arc, near.index];
}

export function initialProgress(
  track: Track,
  p: readonly [number, number],
  hint: number | null = null,
): ProgressState {
  const [arc, segment] = arcPosition(track, p, hint);
  return { s: arc > track.totalLength / 2 ? arc - track.totalLength : arc, segment };
}

export function updateProgress(
  track: Track,
  prev: ProgressState,
  p: readonly [number, number],
): [ProgressState, number] {
  const L = track.totalLength;
  const [arc, segment] = arcPosition(track, p, prev.segment);
  let prevWrapped = prev.s % L;
  if (prevWrapped < 0) prevWrapped += L;
  let delta = arc - prevWrapped;
  if (delta > L / 2) delta -= L;
  else if (delta <= -L / 2) delta += L;
  return [{ s: prev.s + delta, segment }, delta];
}

export function lapsCompleted(s: number, track: Track): number {
  return Math.max(0, Math.floor(s / track.totalLength));
}
