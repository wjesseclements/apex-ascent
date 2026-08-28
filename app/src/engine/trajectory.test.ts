import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import crash from '../../public/trajectories/ppo-5m-track_b-before.trajectory.json';
import { parseTrajectory, type Trajectory } from './schema';
import {
  duration,
  lapAt,
  lerpAngle,
  sampleIndex,
  snapshotAt,
  trailRange,
  wrapClock,
} from './trajectory';

function load(raw: unknown): Trajectory {
  const r = parseTrajectory(raw);
  if (!r.ok) throw new Error(r.error);
  return r.trajectory;
}
const tr = load(scripted);
const crashed = load(crash);
const DT = tr.meta.dt;

describe('duration / wrapClock / sampleIndex', () => {
  it('duration is the last sample time', () => {
    expect(duration(tr)).toBeCloseTo((tr.meta.sampleCount - 1) * DT, 12);
    expect(duration(tr)).toBeCloseTo(60, 6);
  });
  it('wrapClock folds into [0, duration), negatives from the end', () => {
    expect(wrapClock(0, 60)).toBe(0);
    expect(wrapClock(60, 60)).toBe(0);
    expect(wrapClock(61.5, 60)).toBeCloseTo(1.5);
    expect(wrapClock(-1, 60)).toBe(59);
    expect(wrapClock(5, 0)).toBe(0);
  });
  it('index = t / dt, clamped, robust to float noise', () => {
    expect(sampleIndex(tr, 0)).toBe(0);
    expect(sampleIndex(tr, 100 * DT)).toBe(100);
    expect(sampleIndex(tr, 100 * DT - 1e-12)).toBe(100);
    expect(sampleIndex(tr, -5)).toBe(0);
    expect(sampleIndex(tr, 1e9)).toBe(tr.meta.sampleCount - 1);
  });
});

describe('snapshotAt', () => {
  it('reproduces every sample exactly at its own time (O(1) lookup, no scan)', () => {
    for (let i = 0; i < tr.meta.sampleCount; i += 7) {
      const s = snapshotAt(tr, tr.samples.t[i]!);
      expect(s.index).toBe(i);
      expect(s.x).toBe(tr.samples.x[i]);
      expect(s.y).toBe(tr.samples.y[i]);
      expect(s.heading).toBe(tr.samples.heading[i]);
      expect(s.speed).toBe(tr.samples.speed[i]);
      expect(s.aLat).toBe(tr.samples.aLat[i]);
    }
  });
  it('interpolates linearly between samples', () => {
    const i = 500;
    const s = snapshotAt(tr, (i + 0.25) * DT);
    expect(s.index).toBe(i);
    const lerp = (a: number, b: number) => a + (b - a) * 0.25;
    expect(s.x).toBeCloseTo(lerp(tr.samples.x[i]!, tr.samples.x[i + 1]!), 9);
    expect(s.speed).toBeCloseTo(lerp(tr.samples.speed[i]!, tr.samples.speed[i + 1]!), 9);
    expect(s.drive).toBeCloseTo(lerp(tr.samples.drive[i]!, tr.samples.drive[i + 1]!), 9);
  });
  it('clamps beyond the ends', () => {
    const last = tr.meta.sampleCount - 1;
    expect(snapshotAt(tr, 1e6).index).toBe(last);
    expect(snapshotAt(tr, 1e6).x).toBe(tr.samples.x[last]);
    expect(snapshotAt(tr, -3).index).toBe(0);
  });
  it('lap number and lap clock follow the laps table', () => {
    expect(tr.laps.length).toBeGreaterThanOrEqual(2);
    const lap1End = Math.round(tr.laps[0]!.lapTimeSec / DT);
    expect(lapAt(tr, 0)).toEqual({ lap: 1, lapStartStep: 0 });
    expect(lapAt(tr, lap1End - 1).lap).toBe(1);
    expect(lapAt(tr, lap1End)).toEqual({ lap: 2, lapStartStep: lap1End });
    const s = snapshotAt(tr, (lap1End + 60) * DT);
    expect(s.lap).toBe(2);
    expect(s.lapClock).toBeCloseTo(1, 6);
    expect(snapshotAt(tr, 0).lapClock).toBe(0);
  });
  it('flags the crash only on the final sample of a crashed trajectory', () => {
    const last = crashed.meta.sampleCount - 1;
    expect(crashed.meta.crashed).toBe(true);
    expect(snapshotAt(crashed, duration(crashed)).crashed).toBe(true);
    expect(snapshotAt(crashed, (last - 1) * DT).crashed).toBe(false);
    expect(snapshotAt(tr, duration(tr)).crashed).toBe(false);
  });
});

describe('lerpAngle', () => {
  it('takes the short way round and stays in (-π, π]', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 12); // across the seam
    expect(lerpAngle(-3, 3, 0.5)).toBeCloseTo(Math.PI, 12);
    expect(lerpAngle(3, -3, 0.25)).toBeCloseTo(3.0708, 3);
    expect(lerpAngle(Math.PI, -Math.PI, 0.5)).toBe(Math.PI);
    for (let k = 0; k <= 20; k++) {
      const v = lerpAngle(2.9, -2.9, k / 20);
      expect(v).toBeGreaterThan(-Math.PI);
      expect(v).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('trailRange', () => {
  it('covers the last N seconds, clamped at the start', () => {
    expect(trailRange(tr, 10, 2)).toEqual([600 - 120, 600]);
    expect(trailRange(tr, 0.5, 2)).toEqual([0, 30]);
  });
});
