/** Port of `sim/raycast.py`: exact quad-walk raycasts against the track edges. */
import { pointInSegmentQuad } from './containment';
import type { Track } from '../track';

const EPS = 1e-9;
const MAX_STEPS_FACTOR = 2;
const EXIT_LEFT_WALL = 0;
const EXIT_RIGHT_WALL = 1;
const EXIT_FRONT = 2;
const EXIT_BACK = 3;

export interface RayHit {
  readonly distance: number;
  readonly hit: boolean;
  readonly x: number;
  readonly y: number;
}

function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function findContainingQuad(
  track: Track,
  p: readonly [number, number],
  hint: number,
): number {
  const n = track.centerline.length;
  const h = wrapIndex(hint, n);
  if (pointInSegmentQuad(track, h, p)) return h;
  const prev = wrapIndex(h - 1, n);
  if (pointInSegmentQuad(track, prev, p)) return prev;
  const nxt = (h + 1) % n;
  if (pointInSegmentQuad(track, nxt, p)) return nxt;
  for (let i = 0; i < n; i++) if (pointInSegmentQuad(track, i, p)) return i;
  return -1;
}

function exitT(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  a: readonly [number, number],
  b: readonly [number, number],
  cx: number,
  cy: number,
): number {
  let nx = -(b[1] - a[1]);
  let ny = b[0] - a[0];
  if ((cx - a[0]) * nx + (cy - a[1]) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const dn = dx * nx + dy * ny;
  if (dn <= 1e-12) return Infinity;
  return ((a[0] - ox) * nx + (a[1] - oy) * ny) / dn;
}

export function castRay(
  track: Track,
  origin: readonly [number, number],
  direction: readonly [number, number],
  maxRange: number,
  hint: number,
): RayHit {
  const n = track.centerline.length;
  let q = findContainingQuad(track, origin, hint);
  if (q < 0) return { distance: 0, hit: true, x: origin[0], y: origin[1] };
  const [ox, oy] = origin;
  const [dx, dy] = direction;
  let tCur = 0;
  for (let step = 0; step < n * MAX_STEPS_FACTOR; step++) {
    const j = (q + 1) % n;
    const l0 = track.leftEdge[q]!;
    const l1 = track.leftEdge[j]!;
    const r1 = track.rightEdge[j]!;
    const r0 = track.rightEdge[q]!;
    const cx = (l0[0] + l1[0] + r1[0] + r0[0]) / 4;
    const cy = (l0[1] + l1[1] + r1[1] + r0[1]) / 4;
    let t = exitT(ox, oy, dx, dy, l0, l1, cx, cy);
    let exit = EXIT_LEFT_WALL;
    const tRight = exitT(ox, oy, dx, dy, r1, r0, cx, cy);
    if (tRight < t) {
      t = tRight;
      exit = EXIT_RIGHT_WALL;
    }
    const tFront = exitT(ox, oy, dx, dy, l1, r1, cx, cy);
    if (tFront < t - EPS) {
      t = tFront;
      exit = EXIT_FRONT;
    }
    const tBack = exitT(ox, oy, dx, dy, r0, l0, cx, cy);
    if (tBack < t - EPS) {
      t = tBack;
      exit = EXIT_BACK;
    }
    if (t === Infinity) break;
    if (t < tCur) t = tCur;
    if (t >= maxRange) break;
    if (exit === EXIT_LEFT_WALL || exit === EXIT_RIGHT_WALL) {
      return { distance: t, hit: true, x: ox + dx * t, y: oy + dy * t };
    }
    tCur = t;
    q = exit === EXIT_FRONT ? j : wrapIndex(q - 1, n);
  }
  return { distance: maxRange, hit: false, x: ox + dx * maxRange, y: oy + dy * maxRange };
}

export function castFan(
  track: Track,
  origin: readonly [number, number],
  heading: number,
  offsets: readonly number[],
  maxRange: number,
  hint: number,
): RayHit[] {
  return offsets.map((off) =>
    castRay(track, origin, [Math.cos(heading + off), Math.sin(heading + off)], maxRange, hint),
  );
}
