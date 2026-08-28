import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import competence from '../../public/trajectories/ppo-competence-track_a.trajectory.json';
import { parseTrajectory, type Trajectory } from './schema';
import {
  TRACTION_ACCEL_MAX,
  ggMetrics,
  ggMetricsPerLap,
  ggTraceRange,
  isPowerOnCornering,
  isTrailBraking,
} from './gg';

function load(raw: unknown): Trajectory {
  const r = parseTrajectory(raw);
  if (!r.ok) throw new Error(r.error);
  return r.trajectory;
}
const scriptedTr = load(scripted);
const ppo = load(competence);

/** A synthetic trajectory with hand-set (aLong, aLat) columns. */
function synthetic(pairs: [number, number][]): Trajectory {
  const n = pairs.length + 1;
  const col = (v: number) => Array.from({ length: n }, () => v);
  return {
    meta: { ...scriptedTr.meta, sampleCount: n, crashed: false },
    laps: [],
    samples: {
      t: Array.from({ length: n }, (_, i) => i * scriptedTr.meta.dt),
      x: col(0),
      y: col(0),
      heading: col(0),
      speed: col(10),
      steer: col(0),
      drive: col(0),
      aLong: [0, ...pairs.map((p) => p[0])],
      aLat: [0, ...pairs.map((p) => p[1])],
    },
  };
}

describe('tick classification', () => {
  it('trail-braking needs a real brake command AND lateral load', () => {
    expect(isTrailBraking(-5, 10)).toBe(true);
    expect(isTrailBraking(-5, -10)).toBe(true);
    expect(isTrailBraking(-1, 10)).toBe(false); // lift, not brake (aLong excludes drag)
    expect(isTrailBraking(-5, 2)).toBe(false); // straight-line braking
    expect(isTrailBraking(0, 19)).toBe(false);
  });
  it('power-on cornering needs throttle and heavy lateral load', () => {
    expect(isPowerOnCornering(3, 15)).toBe(true);
    expect(isPowerOnCornering(0, 15)).toBe(false);
    expect(isPowerOnCornering(3, 11)).toBe(false);
  });
});

describe('ggMetrics', () => {
  it('computes shares, utilisation, events and peaks on a synthetic run', () => {
    const tr = synthetic([
      [12, 0], // straight, throttle
      [12, 15], // power-on cornering
      [-8, 10], // trail-braking (event 1 starts)
      [-8, 10],
      [0, 19], // pure cornering (event ends)
      [-3, 1], // straight-line braking (event 2)
      [-20, 0], // peak braking (still event 2)
      [12, 0],
    ]);
    const m = ggMetrics(tr);
    expect(m.samples).toBe(8);
    expect(m.trailBrakingShare).toBeCloseTo(2 / 8, 12);
    expect(m.powerOnCorneringShare).toBeCloseTo(1 / 8, 12);
    expect(m.brakingShare).toBeCloseTo(4 / 8, 12);
    expect(m.brakeEvents).toBe(2);
    expect(m.peakLateral).toBe(19);
    expect(m.peakBraking).toBe(-20);
    const expectedGrip =
      [
        12,
        Math.hypot(12, 15),
        Math.hypot(8, 10),
        Math.hypot(8, 10),
        19,
        Math.hypot(3, 1),
        20,
        12,
      ].reduce((a, b) => a + b / TRACTION_ACCEL_MAX, 0) / 8;
    expect(m.gripUtilisation).toBeCloseTo(expectedGrip, 12);
  });
  it('an empty range yields zeros', () => {
    const m = ggMetrics(synthetic([[1, 1]]), 5, 5);
    expect(m.samples).toBe(0);
    expect(m.gripUtilisation).toBe(0);
    expect(m.trailBrakingShare).toBe(0);
  });
  it('never exceeds the grip budget on real data and the reset sample is excluded', () => {
    for (const tr of [scriptedTr, ppo]) {
      const m = ggMetrics(tr);
      expect(m.samples).toBe(tr.meta.sampleCount - 1);
      expect(m.gripUtilisation).toBeGreaterThan(0);
      expect(m.gripUtilisation).toBeLessThanOrEqual(1 + 1e-9);
      expect(m.peakLateral).toBeLessThanOrEqual(TRACTION_ACCEL_MAX + 1e-6);
      expect(m.peakBraking).toBeGreaterThanOrEqual(-TRACTION_ACCEL_MAX - 1e-6);
    }
  });
  it('the competence checkpoint essentially never brakes (the Slice 5 observation, quantified)', () => {
    const m = ggMetrics(ppo);
    expect(m.brakingShare).toBeLessThan(0.05);
    expect(m.trailBrakingShare).toBeLessThan(0.05);
    expect(m.gripUtilisation).toBeGreaterThan(0.5);
  });
  it('per-lap metrics cover each completed lap', () => {
    const laps = ggMetricsPerLap(ppo);
    expect(laps.length).toBe(ppo.laps.length);
    for (const [i, m] of laps.entries()) {
      const lap = ppo.laps[i]!;
      const expected = Math.round(lap.lapTimeSec / ppo.meta.dt) - (lap.startStep === 0 ? 1 : 0);
      expect(m.samples).toBe(expected);
    }
  });
  it('trace range clamps at both ends', () => {
    expect(ggTraceRange(ppo, 600, 2)).toEqual([600 - Math.round(2 / ppo.meta.dt), 600]);
    expect(ggTraceRange(ppo, 10, 2)).toEqual([0, 10]);
    expect(ggTraceRange(ppo, 1e9, 2)[1]).toBe(ppo.meta.sampleCount - 1);
  });
});
