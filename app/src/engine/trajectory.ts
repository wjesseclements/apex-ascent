/**
 * Reading a trajectory at an arbitrary time: O(1) lookup by index (CLAUDE.md
 * app rule 3) plus linear interpolation between neighbouring samples.
 *
 * Sample i sits at t = i · dt exactly, so `index = t / dt` needs no search.
 * Heading is interpolated along the shorter arc and re-wrapped to (-π, π].
 */
import { TAU, wrapAngle } from './angle';
import type { Trajectory } from './schema';

export interface CarSnapshot {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly speed: number;
  readonly steer: number;
  readonly drive: number;
  readonly aLong: number;
  readonly aLat: number;
  /** Index of the sample at or before t. */
  readonly index: number;
  /** 1-based lap currently being driven. */
  readonly lap: number;
  /** Seconds into the current lap. */
  readonly lapClock: number;
  /** True on the final sample of a crashed trajectory. */
  readonly crashed: boolean;
}

/** Playback length in seconds: the time of the last sample. */
export function duration(tr: Trajectory): number {
  return (tr.meta.sampleCount - 1) * tr.meta.dt;
}

/** Fold a clock value into [0, duration); negative values come round from the end. */
export function wrapClock(t: number, dur: number): number {
  if (!(dur > 0)) return 0;
  const m = t % dur;
  return m < 0 ? m + dur : m;
}

/** Index of the sample at or before t, clamped into [0, sampleCount - 1]. */
export function sampleIndex(tr: Trajectory, t: number): number {
  const i = Math.floor(t / tr.meta.dt + 1e-9);
  return Math.max(0, Math.min(tr.meta.sampleCount - 1, i));
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Interpolate headings along the shorter arc, result wrapped to (-π, π]. */
export function lerpAngle(a: number, b: number, f: number): number {
  let delta = b - a;
  if (delta > Math.PI) delta -= TAU;
  else if (delta <= -Math.PI) delta += TAU;
  return wrapAngle(a + delta * f);
}

export interface LapPosition {
  readonly lap: number;
  readonly lapStartStep: number;
}

/** Which lap sample `index` belongs to, from the laps table. */
export function lapAt(tr: Trajectory, index: number): LapPosition {
  let lap = 1;
  let lapStartStep = 0;
  for (const l of tr.laps) {
    const end = l.startStep + Math.round(l.lapTimeSec / tr.meta.dt);
    if (index >= end) {
      lap += 1;
      lapStartStep = end;
    } else break;
  }
  return { lap, lapStartStep };
}

/** The car state at time t (seconds), interpolated between samples. */
export function snapshotAt(tr: Trajectory, t: number): CarSnapshot {
  const s = tr.samples;
  const n = tr.meta.sampleCount;
  const i = sampleIndex(tr, t);
  const j = Math.min(n - 1, i + 1);
  const f = i === j ? 0 : Math.max(0, Math.min(1, (t - s.t[i]!) / tr.meta.dt));
  const { lap, lapStartStep } = lapAt(tr, i);
  const tt = lerp(s.t[i]!, s.t[j]!, f);
  return {
    t: tt,
    x: lerp(s.x[i]!, s.x[j]!, f),
    y: lerp(s.y[i]!, s.y[j]!, f),
    heading: lerpAngle(s.heading[i]!, s.heading[j]!, f),
    speed: lerp(s.speed[i]!, s.speed[j]!, f),
    steer: lerp(s.steer[i]!, s.steer[j]!, f),
    drive: lerp(s.drive[i]!, s.drive[j]!, f),
    aLong: lerp(s.aLong[i]!, s.aLong[j]!, f),
    aLat: lerp(s.aLat[i]!, s.aLat[j]!, f),
    index: i,
    lap,
    lapClock: tt - lapStartStep * tr.meta.dt,
    crashed: tr.meta.crashed && i === n - 1,
  };
}

/** Sample indices covering the last `seconds` before t (for a trail). */
export function trailRange(tr: Trajectory, t: number, seconds: number): [number, number] {
  const end = sampleIndex(tr, t);
  const start = Math.max(0, end - Math.round(seconds / tr.meta.dt));
  return [start, end];
}
