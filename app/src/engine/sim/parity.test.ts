/**
 * Python↔TS parity (SPEC §9): replay Python-recorded action tapes open-loop and
 * compare every tick. Tolerances are tripwires with reasons:
 *  - POSITION_TOL 1 cm (SPEC §9's stated bound). Python's libm and V8's Math.sin/cos
 *    differ in the last ulp; an open-loop replay does not amplify that, so 1e-9 m
 *    would probably pass — the SPEC number is kept as the contract.
 *  - HEADING_TOL 1e-9 rad, SPEED_TOL 1e-9 m/s, ACCEL_TOL 1e-9 m/s²: pure IEEE
 *    arithmetic paths, so rounding-level.
 *  - OBS_TOL 1e-6: observations are float32 on both sides; 1e-6 is the float32
 *    rounding budget at magnitude 1.
 */
import scriptedA from './__fixtures__/parity-scripted-track_a.json';
import scriptedMirror from './__fixtures__/parity-scripted-track_a_mirror.json';
import scriptedB from './__fixtures__/parity-scripted-track_b.json';
import ppoA from './__fixtures__/parity-ppo-track_a.json';
import scriptedLowDrag from './__fixtures__/parity-scripted-track_a-low-drag.json';
import { getTrack } from '../../data/tracks';
import type { PhysicsConfig, RayConfig } from './config';
import { DEFAULT_RAYS, PHYSICS_PRESETS, type PhysicsPresetId } from './config';
import { observe } from './observation';
import { reset, sense, step } from './world';

export const POSITION_TOL = 0.01;
export const HEADING_TOL = 1e-9;
export const SPEED_TOL = 1e-9;
export const ACCEL_TOL = 1e-9;
export const OBS_TOL = 1e-6;

interface Tape {
  policy: string;
  track: string;
  physicsPreset: PhysicsPresetId;
  physics: PhysicsConfig;
  rays: RayConfig;
  physicsConfigHash: string;
  initial: { x: number; y: number; heading: number; speed: number };
  ticks: number;
  actions: number[][];
  expected: {
    x: number[];
    y: number[];
    heading: number[];
    speed: number[];
    aLong: number[];
    aLat: number[];
    s: number[];
    crashed: boolean[];
  };
  observations: number[][];
}

const TAPES: [string, Tape][] = [
  ['scripted · track_a (1800)', scriptedA as Tape],
  ['scripted · track_a_mirror (600)', scriptedMirror as Tape],
  ['scripted · track_b (600)', scriptedB as Tape],
  ['ppo@8M · track_a (1800)', ppoA as Tape],
  ['scripted · track_a · low-drag (900)', scriptedLowDrag as Tape],
];

describe.each(TAPES)('parity: %s', (_name, tape) => {
  const track = getTrack(tape.track);

  it('fixture carries the named physics preset and its hash (pinned on both sides)', () => {
    const preset = PHYSICS_PRESETS[tape.physicsPreset];
    expect(tape.physics).toEqual(preset.physics);
    expect(tape.physicsConfigHash).toBe(preset.hash);
    expect(tape.rays).toEqual(DEFAULT_RAYS);
  });

  it('replays the tape within tolerances at every tick', () => {
    let w = reset(track, tape.physics);
    expect(w.car).toEqual(tape.initial);
    let prev = { steer: 0, drive: 0 };
    let aLat = 0;
    let maxPos = 0;
    let maxObs = 0;
    // tick 0 observation
    const obs0 = observe(
      sense(track, w, tape.rays),
      w.car.speed,
      aLat,
      prev,
      tape.physics,
      tape.rays,
    );
    obs0.forEach((v, k) => (maxObs = Math.max(maxObs, Math.abs(v - tape.observations[0]![k]!))));
    for (let i = 0; i < tape.ticks; i++) {
      const [steer, drive] = tape.actions[i]!;
      const action = { steer: steer!, drive: drive! };
      const [next, t] = step(track, w, action, tape.physics);
      w = next;
      prev = action;
      aLat = t.aLat;
      const e = tape.expected;
      const dp = Math.hypot(w.car.x - e.x[i]!, w.car.y - e.y[i]!);
      maxPos = Math.max(maxPos, dp);
      expect(dp).toBeLessThanOrEqual(POSITION_TOL);
      expect(Math.abs(w.car.heading - e.heading[i]!)).toBeLessThanOrEqual(HEADING_TOL);
      expect(Math.abs(w.car.speed - e.speed[i]!)).toBeLessThanOrEqual(SPEED_TOL);
      expect(Math.abs(t.aLong - e.aLong[i]!)).toBeLessThanOrEqual(ACCEL_TOL);
      expect(Math.abs(t.aLat - e.aLat[i]!)).toBeLessThanOrEqual(ACCEL_TOL);
      expect(Math.abs(w.progress.s - e.s[i]!)).toBeLessThanOrEqual(POSITION_TOL);
      expect(w.crashed).toBe(e.crashed[i]);
      if (w.crashed) break;
      const obs = observe(
        sense(track, w, tape.rays),
        w.car.speed,
        aLat,
        prev,
        tape.physics,
        tape.rays,
      );
      const want = tape.observations[i + 1]!;
      expect(obs.length).toBe(want.length);
      obs.forEach((v, k) => {
        const d = Math.abs(v - want[k]!);
        maxObs = Math.max(maxObs, d);
        expect(d).toBeLessThanOrEqual(OBS_TOL);
      });
    }
    // report the actual drift so a future regression is visible in the log, not just pass/fail
    console.info(
      `parity drift: max position ${maxPos.toExponential(2)} m, max obs ${maxObs.toExponential(2)}`,
    );
    expect(maxPos).toBeLessThanOrEqual(POSITION_TOL);
    expect(maxObs).toBeLessThanOrEqual(OBS_TOL);
  });
});
