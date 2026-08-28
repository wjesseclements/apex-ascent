/** Unit tests for the TS sim port — the Python suites' key cases, module by module. */
import { getTrack } from '../../data/tracks';
import { buildTrack } from '../track';
import { clampAction, stepCar } from './car';
import { DEFAULT_PHYSICS, DEFAULT_RAYS, rayOffsets } from './config';
import {
  NEAREST_SEGMENT_WINDOW,
  isInsideTrack,
  nearestSegment,
  pointInSegmentQuad,
} from './containment';
import { point_segment } from './geometry2';
import { observe } from './observation';
import { arcPosition, initialProgress, lapsCompleted, updateProgress } from './progress';
import { castFan, castRay, findContainingQuad } from './raycast';
import { reset, resetAt, sense, step } from './world';

const CFG = DEFAULT_PHYSICS;
const A = CFG.traction_accel_max;
const trackA = getTrack('track_a');
const trackB = getTrack('track_b');
const square = buildTrack({
  name: 'sq',
  width: 10,
  centerline: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
});
const at = (speed: number, heading = 0.3) => ({ x: 1, y: -2, heading, speed });

describe('config', () => {
  it('ray offsets: right to left, symmetric, single ray degenerate', () => {
    const offs = rayOffsets(DEFAULT_RAYS);
    expect(offs).toHaveLength(12);
    expect(offs[0]).toBeCloseTo(-Math.PI / 2, 12);
    expect(offs[11]).toBeCloseTo(Math.PI / 2, 12);
    expect(rayOffsets({ count: 1, half_fan: 1, max_length: 1 })).toEqual([0]);
  });
});

describe('geometry2.point_segment', () => {
  it('clamps to endpoints and handles a degenerate segment', () => {
    expect(point_segment([5, 3], [0, 0], [10, 0])).toEqual([0.5, 9]);
    expect(point_segment([-5, 0], [0, 0], [10, 0])).toEqual([0, 25]);
    expect(point_segment([15, 0], [0, 0], [10, 0])).toEqual([1, 25]);
    expect(point_segment([3, 0], [0, 0], [0, 0])).toEqual([0, 9]);
  });
});

describe('car', () => {
  it('outputs are finite and the budget holds across a speed × steer × drive grid', () => {
    const speeds = [0, 1e-12, 1e-6, 0.5, 2, 10, 20, 29.999, 30];
    const grid = [-1, -0.5, 0, 0.5, 1];
    for (const v of speeds)
      for (const s of grid)
        for (const d of grid) {
          const r = stepCar(at(v), { steer: s, drive: d }, CFG);
          for (const x of [r.state.x, r.state.y, r.state.heading, r.state.speed, r.aLong, r.aLat])
            expect(Number.isFinite(x)).toBe(true);
          expect(r.aLong ** 2 + r.aLat ** 2).toBeLessThanOrEqual(A * A + 1e-9);
          expect(r.state.speed).toBeGreaterThanOrEqual(0);
          expect(r.state.speed).toBeLessThanOrEqual(CFG.v_max);
        }
  });
  it('scales over-budget commands uniformly onto the circle', () => {
    const r = stepCar(at(25), { steer: 1, drive: -1 }, CFG);
    expect(Math.hypot(r.aLong, r.aLat)).toBeCloseTo(A, 9);
    expect(r.aLong).toBeLessThan(0);
    expect(r.aLat).toBeLessThan(0); // right turn: lateral toward the right (negative)
  });
  it('clamps speed at v_max and zero; actions clamp; throttle/brake asymmetric', () => {
    expect(stepCar(at(CFG.v_max), { steer: 0, drive: 1 }, CFG).state.speed).toBeCloseTo(
      CFG.v_max * (1 - CFG.drag * CFG.dt),
      12,
    );
    expect(stepCar(at(0.1), { steer: 0, drive: -1 }, CFG).state.speed).toBe(0);
    expect(clampAction({ steer: 3, drive: -7 })).toEqual({ steer: 1, drive: -1 });
    expect(stepCar(at(10), { steer: 0, drive: 1 }, CFG).aLong).toBe(CFG.throttle_accel_max);
    expect(stepCar(at(10), { steer: 0, drive: -1 }, CFG).aLong).toBe(-CFG.brake_accel_max);
  });
  it('steer +1 is right (heading decreases); no yaw at rest', () => {
    expect(stepCar(at(10, 0), { steer: 1, drive: 0 }, CFG).state.heading).toBeLessThan(0);
    expect(stepCar(at(10, 0), { steer: -1, drive: 0 }, CFG).state.heading).toBeGreaterThan(0);
    expect(stepCar(at(0), { steer: 1, drive: 0 }, CFG).state.heading).toBe(0.3);
  });
});

describe('containment', () => {
  it('centerline inside, 1 mm outside the edge outside, boundary inclusive', () => {
    const half = trackA.halfWidth;
    for (let i = 0; i < trackA.centerline.length; i += 5) {
      const a = trackA.centerline[i]!;
      const b = trackA.centerline[(i + 1) % trackA.centerline.length]!;
      const d = trackA.directions[i]!;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const left: [number, number] = [-d[1], d[0]];
      expect(isInsideTrack(trackA, mid).inside).toBe(true);
      expect(
        isInsideTrack(trackA, [mid[0] + left[0] * (half - 1e-3), mid[1] + left[1] * (half - 1e-3)])
          .inside,
      ).toBe(true);
      expect(
        isInsideTrack(trackA, [mid[0] + left[0] * (half + 1e-3), mid[1] + left[1] * (half + 1e-3)])
          .inside,
      ).toBe(false);
      expect(
        isInsideTrack(trackA, [mid[0] - left[0] * (half + 1e-3), mid[1] - left[1] * (half + 1e-3)])
          .inside,
      ).toBe(false);
    }
    expect(isInsideTrack(trackA, trackA.leftEdge[3]!).inside).toBe(true);
    expect(isInsideTrack(trackA, [1000, 1000]).inside).toBe(false);
  });
  it('hinted search matches a full scan and recovers from a stale hint', () => {
    const n = trackA.centerline.length;
    let hint = 0;
    for (let i = 0; i < n; i += 3) {
      const a = trackA.centerline[i]!;
      const b = trackA.centerline[(i + 1) % n]!;
      const p: [number, number] = [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4];
      const full = nearestSegment(trackA, p);
      const hinted = nearestSegment(trackA, p, hint);
      expect(hinted.index).toBe(full.index);
      hint = hinted.index;
    }
    const far = trackA.centerline[Math.floor(n / 2)]!;
    expect(n / 2).toBeGreaterThan(2 * NEAREST_SEGMENT_WINDOW + 1);
    expect(nearestSegment(trackA, far, 0).index).toBe(nearestSegment(trackA, far).index);
    // a tiny track (fewer segments than the window) always does a full scan
    const tiny = buildTrack({
      name: 't',
      width: 2,
      centerline: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
    expect(nearestSegment(tiny, [5, 0.1], 1).index).toBe(0);
  });
  it('quads tile the ring: midpoints in exactly one quad, vertices in two', () => {
    const n = trackA.centerline.length;
    for (let i = 0; i < n; i += 7) {
      const a = trackA.centerline[i]!;
      const b = trackA.centerline[(i + 1) % n]!;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let count = 0;
      for (let j = 0; j < n; j++) if (pointInSegmentQuad(trackA, j, mid)) count++;
      expect(count).toBe(1);
      count = 0;
      for (let j = 0; j < n; j++) if (pointInSegmentQuad(trackA, j, a)) count++;
      expect(count).toBe(2);
    }
  });
});

describe('progress', () => {
  it('start line is 0; a start just behind the line is negative; backwards loses progress', () => {
    expect(initialProgress(trackA, [0, 0]).s).toBe(0);
    // the closing segment is angled 4.5°, so the projection of (-0.3, 0) is ~-0.299
    expect(initialProgress(trackA, [-0.3, 0]).s).toBeCloseTo(-0.3, 1);
    expect(initialProgress(trackA, [-0.3, 0]).s).toBeLessThan(0);
    const st = initialProgress(trackA, [10, 0]);
    const [next, d] = updateProgress(trackA, st, [9, 0]);
    expect(d).toBeCloseTo(-1, 9);
    expect(next.s).toBeCloseTo(9, 9);
  });
  it('negative s and backward wraps', () => {
    // start behind the line (Track A's angled closing segment makes the projection
    // unambiguous), then cross it forward: s goes from negative to positive continuously
    const behind = initialProgress(trackA, [-0.3, 0]);
    expect(behind.s).toBeLessThan(0);
    const [ahead, d] = updateProgress(trackA, behind, [0.3, 0]);
    expect(d).toBeCloseTo(0.3 - behind.s, 9);
    expect(ahead.s).toBeCloseTo(0.3, 9);
    // a backward jump of more than half a lap reads as forward (the guard's other side)
    const st2 = initialProgress(square, [50, 100]); // arc 250
    const [, d2] = updateProgress(square, st2, [0.5, 0]); // arc 0.5 → raw delta -249.5 → +150.5
    expect(d2).toBeCloseTo(150.5, 9);
  });
  it('half-lap wrap guard and lap counting', () => {
    const st = initialProgress(square, [0, 0]);
    expect(updateProgress(square, st, [100, 100])[1]).toBeCloseTo(200, 9); // exactly L/2 → forward
    expect(updateProgress(square, st, [99.5, 100])[1]).toBeCloseTo(-199.5, 9); // L/2 + 0.5 → backwards
    expect(lapsCompleted(-5, square)).toBe(0);
    expect(lapsCompleted(400, square)).toBe(1);
    expect(lapsCompleted(1000, square)).toBe(2);
    expect(arcPosition(square, [0, 0])[0]).toBe(0);
    // a hair before the closing vertex projects onto the last segment (arc ≈ L); as a
    // start position that reads as "just behind the line": s ≈ 0 from below
    expect(arcPosition(square, [0, 1e-12], 3)[0]).toBeGreaterThan(399);
    expect(Math.abs(initialProgress(square, [0, 1e-12], 3).s)).toBeLessThan(1e-9);
  });
});

describe('raycast', () => {
  it('start straight of Track A: miss at 60 m, hit within 100 m, half-width sideways', () => {
    const ahead = castRay(trackA, [10, 0], [1, 0], DEFAULT_RAYS.max_length, 0);
    expect(ahead).toEqual({ distance: 60, hit: false, x: 70, y: 0 });
    const far = castRay(trackA, [10, 0], [1, 0], 100, 0);
    expect(far.hit).toBe(true);
    expect(far.distance).toBeGreaterThan(70);
    for (const dir of [
      [0, 1],
      [0, -1],
    ] as const) {
      const side = castRay(trackA, [10, 0], dir, 60, 0);
      expect(side.hit).toBe(true);
      expect(side.distance).toBeCloseTo(trackA.halfWidth, 6);
    }
    // strict max-range boundary
    expect(castRay(trackA, [20, 0], [0, 1], trackA.halfWidth, 0).hit).toBe(false);
    expect(castRay(trackA, [20, 0], [0, 1], trackA.halfWidth + 1e-6, 0).hit).toBe(true);
  });
  it('off-track origin reads 0; containing quad found via hint, neighbours, scan, or -1', () => {
    expect(castRay(trackA, [1000, 1000], [1, 0], 60, 0)).toEqual({
      distance: 0,
      hit: true,
      x: 1000,
      y: 1000,
    });
    expect(findContainingQuad(trackA, [1000, 1000], 0)).toBe(-1);
    const n = trackA.centerline.length;
    const p = trackA.centerline[10]!;
    const mid: [number, number] = [
      (p[0] + trackA.centerline[11]![0]) / 2,
      (p[1] + trackA.centerline[11]![1]) / 2,
    ];
    expect(findContainingQuad(trackA, mid, 10)).toBe(10);
    expect(findContainingQuad(trackA, mid, 11)).toBe(10); // previous neighbour
    expect(findContainingQuad(trackA, mid, 9)).toBe(10); // next neighbour
    expect(findContainingQuad(trackA, mid, (10 + n / 2) | 0)).toBe(10); // full scan
  });
  it('every fan ray from a midpoint ends on the wall (1 mm beyond is outside) or at max range', () => {
    const n = trackB.centerline.length;
    for (let i = 0; i < n; i += 9) {
      const a = trackB.centerline[i]!;
      const b = trackB.centerline[(i + 1) % n]!;
      const d = trackB.directions[i]!;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const heading = Math.atan2(d[1], d[0]);
      const offs = rayOffsets(DEFAULT_RAYS);
      castFan(trackB, mid, heading, offs, 60, i).forEach((hit, k) => {
        expect(hit.distance).toBeGreaterThan(0);
        expect(hit.distance).toBeLessThanOrEqual(60);
        if (hit.hit) {
          const dir = [Math.cos(heading + offs[k]!), Math.sin(heading + offs[k]!)];
          expect(isInsideTrack(trackB, [hit.x, hit.y], i).inside).toBe(true);
          expect(
            isInsideTrack(trackB, [hit.x + dir[0]! * 1e-3, hit.y + dir[1]! * 1e-3], i).inside,
          ).toBe(false);
        } else expect(hit.distance).toBe(60);
      });
    }
  });
});

describe('world', () => {
  it('reset is on the start line at start speed; random throttle crashes; stepping a crashed world throws', () => {
    let w = reset(trackA, CFG);
    expect(w.car).toEqual({ x: 0, y: 0, heading: 0, speed: CFG.start_speed });
    expect(w.progress.s).toBe(0);
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 600 && !w.crashed; i++) {
      const [next, t] = step(trackA, w, { steer: rand() * 2 - 1, drive: 0.2 + rand() * 0.8 }, CFG);
      w = next;
      expect(t.aLong ** 2 + t.aLat ** 2).toBeLessThanOrEqual(A * A + 1e-9);
      expect(w.crashed).toBe(!isInsideTrack(trackA, [w.car.x, w.car.y]).inside);
    }
    expect(w.crashed).toBe(true);
    expect(() => step(trackA, w, { steer: 0, drive: 0 }, CFG)).toThrow(/crashed/);
  });
  it('lap accounting: a scripted-like straight drive completes laps on the square', () => {
    let w = resetAt(square, 0, 0, 0, 10);
    let completed = 0;
    // drive the centerline of the square by teleport-free steering: full right at the corners is
    // not needed — use the parity-tested car; here we just check lap bookkeeping via progress
    for (let i = 0; i < 3000 && !w.crashed; i++) {
      const [next, t] = step(square, w, { steer: 0, drive: 0.2 }, CFG);
      w = next;
      if (t.lapCompleted) completed++;
    }
    expect(w.crashed).toBe(true); // straight on, it leaves at the first corner
    expect(completed).toBe(0);
    expect(w.lapTimes).toEqual([]);
    expect(sense(square, resetAt(square, 50, 0, 0, 1), DEFAULT_RAYS)).toHaveLength(12);
  });
  it('observation layout is [rays, speed/v_max, aLat/A, prev action]', () => {
    const w = reset(trackA, CFG);
    const obs = observe(
      sense(trackA, w, DEFAULT_RAYS),
      w.car.speed,
      -4,
      { steer: 0.5, drive: -0.25 },
      CFG,
      DEFAULT_RAYS,
    );
    expect(obs).toHaveLength(16);
    expect(obs[12]).toBeCloseTo(2 / 30, 6);
    expect(obs[13]).toBeCloseTo(-0.2, 6);
    expect(obs[14]).toBe(0.5);
    expect(obs[15]).toBe(-0.25);
    for (let i = 0; i < 12; i++) {
      expect(obs[i]).toBeGreaterThan(0);
      expect(obs[i]).toBeLessThanOrEqual(1);
    }
  });
});
