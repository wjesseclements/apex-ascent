/**
 * Track geometry: a closed centerline polyline with uniform width, plus the
 * mitered left/right edges and arc-length tables derived from it.
 *
 * A faithful port of `trainer/apex_trainer/sim/track.py` (same construction,
 * same names) so the app draws exactly the surface the trainer simulated on.
 * `track.test.ts` pins it against a Python-generated fixture to 1e-9 m.
 *
 * Conventions: SPEC §3.3 — x right, y up, meters; travel direction = point
 * order; the loop is closed implicitly (no duplicated vertex). Segment i runs
 * from centerline[i] to centerline[(i + 1) % n].
 */
import { dot, leftNormal, normalize, sub, type Vec2 } from './geometry';

/** Reject vertex turns sharper than this (cos of half the turn): edges would cross. */
export const MIN_MITER_COS_HALF = 0.1;

export interface TrackData {
  readonly name: string;
  readonly width: number;
  readonly centerline: ReadonlyArray<readonly [number, number]>;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Track {
  readonly name: string;
  readonly width: number;
  readonly halfWidth: number;
  readonly centerline: readonly Vec2[];
  /** Unit direction of segment i. */
  readonly directions: readonly Vec2[];
  readonly leftEdge: readonly Vec2[];
  readonly rightEdge: readonly Vec2[];
  readonly segmentLengths: readonly number[];
  /** Arc length from centerline[0] to centerline[i]; segmentStart[0] = 0. */
  readonly segmentStart: readonly number[];
  readonly totalLength: number;
  readonly start: { readonly x: number; readonly y: number; readonly heading: number };
  readonly bounds: Bounds;
}

export class TrackFormatError extends Error {}

/** Validate untrusted JSON into TrackData (mirrors Python parse_track_data). */
export function parseTrackData(raw: unknown): TrackData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TrackFormatError('track: not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  const { name, width, centerline } = r;
  if (typeof name !== 'string' || name.length === 0) {
    throw new TrackFormatError('track: name must be a non-empty string');
  }
  if (typeof width !== 'number' || !(width > 0)) {
    throw new TrackFormatError('track: width must be a positive number');
  }
  if (!Array.isArray(centerline)) throw new TrackFormatError('track: centerline must be an array');
  if (centerline.length < 3) {
    throw new TrackFormatError('track: centerline needs at least 3 points');
  }
  const points: [number, number][] = [];
  centerline.forEach((p: unknown, i: number) => {
    if (!Array.isArray(p) || p.length !== 2) {
      throw new TrackFormatError(`track: centerline[${i}] must be [x, y]`);
    }
    const [x, y] = p as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      throw new TrackFormatError(`track: centerline[${i}] must be finite numbers`);
    }
    points.push([x, y]);
  });
  return { name, width, centerline: points };
}

export function buildTrack(data: TrackData): Track {
  const n = data.centerline.length;
  if (n < 3) throw new TrackFormatError('track: centerline needs at least 3 points');
  const c: Vec2[] = data.centerline.map(([x, y]) => [x, y]);
  const half = data.width / 2;

  const directions: Vec2[] = [];
  const segmentLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = sub(c[(i + 1) % n]!, c[i]!);
    const len = Math.hypot(d[0], d[1]);
    if (len === 0) {
      throw new TrackFormatError(`track: duplicate consecutive centerline points at ${i}`);
    }
    directions.push([d[0] / len, d[1] / len]);
    segmentLengths.push(len);
  }

  // Mitered offset at each vertex: bisector of the adjacent segments' left
  // normals, scaled so the offset point is exactly `half` from both segments.
  const leftEdge: Vec2[] = [];
  const rightEdge: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const nPrev = leftNormal(directions[(i - 1 + n) % n]!);
    const nNext = leftNormal(directions[i]!);
    const bis = normalize([nPrev[0] + nNext[0], nPrev[1] + nNext[1]]);
    const cosHalf = dot(bis, nNext);
    if (cosHalf < MIN_MITER_COS_HALF) {
      throw new TrackFormatError(`track: turn at vertex ${i} is too sharp to offset`);
    }
    const m = half / cosHalf;
    const [cx, cy] = c[i]!;
    leftEdge.push([cx + bis[0] * m, cy + bis[1] * m]);
    rightEdge.push([cx - bis[0] * m, cy - bis[1] * m]);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of [...leftEdge, ...rightEdge]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const segmentStart: number[] = [];
  let acc = 0;
  for (const len of segmentLengths) {
    segmentStart.push(acc);
    acc += len;
  }
  const d0 = directions[0]!;
  return {
    name: data.name,
    width: data.width,
    halfWidth: half,
    centerline: c,
    directions,
    leftEdge,
    rightEdge,
    segmentLengths,
    segmentStart,
    totalLength: acc,
    start: { x: c[0]![0], y: c[0]![1], heading: Math.atan2(d0[1], d0[0]) },
    bounds: { minX, minY, maxX, maxY },
  };
}
