/** Port of `sim/containment.py`: localized nearest-segment search and quad containment. */
import { point_segment } from './geometry2';
import type { Track } from '../track';

export const NEAREST_SEGMENT_WINDOW = 3;
export const ON_EDGE_EPS = 1e-9;

export interface NearestSegment {
  readonly index: number;
  readonly t: number;
  readonly distSq: number;
}

function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function scan(
  track: Track,
  p: readonly [number, number],
  first: number,
  last: number,
): NearestSegment {
  const n = track.centerline.length;
  const c = track.centerline;
  let bestIndex = wrapIndex(first, n);
  let bestT = 0;
  let bestDistSq = Infinity;
  for (let k = first; k <= last; k++) {
    const i = wrapIndex(k, n);
    const [t, distSq] = point_segment(p, c[i]!, c[(i + 1) % n]!);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
      bestT = t;
    }
  }
  return { index: bestIndex, t: bestT, distSq: bestDistSq };
}

export function nearestSegment(
  track: Track,
  p: readonly [number, number],
  hint: number | null = null,
): NearestSegment {
  const n = track.centerline.length;
  if (hint !== null && n > 2 * NEAREST_SEGMENT_WINDOW + 1) {
    let best = scan(track, p, hint - NEAREST_SEGMENT_WINDOW, hint + NEAREST_SEGMENT_WINDOW);
    const offset = wrapIndex(best.index - hint + NEAREST_SEGMENT_WINDOW, n);
    if (offset === 0 || offset === 2 * NEAREST_SEGMENT_WINDOW) best = scan(track, p, 0, n - 1);
    return best;
  }
  return scan(track, p, 0, n - 1);
}

function side(
  a: readonly [number, number],
  b: readonly [number, number],
  p: readonly [number, number],
): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

export function pointInSegmentQuad(track: Track, i: number, p: readonly [number, number]): boolean {
  const n = track.centerline.length;
  const j = (i + 1) % n;
  const q0 = track.leftEdge[i]!;
  const q1 = track.leftEdge[j]!;
  const q2 = track.rightEdge[j]!;
  const q3 = track.rightEdge[i]!;
  const s0 = side(q0, q1, p);
  const s1 = side(q1, q2, p);
  const s2 = side(q2, q3, p);
  const s3 = side(q3, q0, p);
  const e = ON_EDGE_EPS;
  const allNonNeg = s0 >= -e && s1 >= -e && s2 >= -e && s3 >= -e;
  const allNonPos = s0 <= e && s1 <= e && s2 <= e && s3 <= e;
  return allNonNeg || allNonPos;
}

export interface InsideResult {
  readonly inside: boolean;
  readonly segment: number;
}

export function isInsideTrack(
  track: Track,
  p: readonly [number, number],
  hint: number | null = null,
): InsideResult {
  const n = track.centerline.length;
  const index = nearestSegment(track, p, hint).index;
  const inside =
    pointInSegmentQuad(track, index, p) ||
    pointInSegmentQuad(track, wrapIndex(index - 1, n), p) ||
    pointInSegmentQuad(track, (index + 1) % n, p);
  return { inside, segment: index };
}
