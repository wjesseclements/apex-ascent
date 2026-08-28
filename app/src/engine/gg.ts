/**
 * Traction-circle ("g-g") metrics from a trajectory's `aLong` / `aLat` columns —
 * the evidence for the project's headline question: does the policy trail-brake?
 *
 * **What `aLong` is (resolved against `trainer/apex_trainer/sim/car.py`):** the
 * traction-scaled *commanded* longitudinal acceleration — throttle or brake
 * after the circle has scaled the (a_long, a_lat) vector. It EXCLUDES drag,
 * which the sim applies afterwards as a multiplicative speed decay outside the
 * grip budget: coasting at 30 m/s exports `aLong = 0` while drag alone
 * decelerates the car at ~9 m/s²; `drive = −0.1` exports exactly −2.0. So
 * `aLong < 0` is a genuine brake command, and lift-and-coast never counts as
 * braking here.
 *
 * Thresholds (approved as revisable starting points; m/s²):
 */
import type { Trajectory } from './schema';

/** Grip budget A (SPEC §3.2): the circle's radius, m/s². */
export const TRACTION_ACCEL_MAX = 20;
/** Braking harder than this while cornering counts as trail-braking (drive < −0.1). */
export const TRAIL_BRAKE_ALONG_MAX = -2;
/** ... with at least this much lateral load (a fifth of the budget). */
export const TRAIL_BRAKE_ALAT_MIN = 4;
/** Throttle on with at least this much lateral load: power-on cornering. */
export const POWER_ON_ALAT_MIN = 12;
/** A "brake event" starts when aLong drops below this and ends when it rises above. */
export const BRAKE_EVENT_ALONG = -1;

export interface GgMetrics {
  /** Samples considered (excludes sample 0, the reset state). */
  readonly samples: number;
  /** Mean √(aLong² + aLat²) / A over the samples, in [0, 1]. */
  readonly gripUtilisation: number;
  /** Share of samples that are trail-braking ticks, in [0, 1]. */
  readonly trailBrakingShare: number;
  /** Share of samples that are power-on cornering ticks, in [0, 1]. */
  readonly powerOnCorneringShare: number;
  /** Share of samples with any braking (aLong < 0). */
  readonly brakingShare: number;
  /** Distinct braking events (aLong crossing BRAKE_EVENT_ALONG downward). */
  readonly brakeEvents: number;
  /** Peak |aLat| seen, m/s². */
  readonly peakLateral: number;
  /** Peak braking (most negative aLong), m/s². */
  readonly peakBraking: number;
}

/** Classify one tick. */
export function isTrailBraking(aLong: number, aLat: number): boolean {
  return aLong < TRAIL_BRAKE_ALONG_MAX && Math.abs(aLat) > TRAIL_BRAKE_ALAT_MIN;
}

export function isPowerOnCornering(aLong: number, aLat: number): boolean {
  return aLong > 0 && Math.abs(aLat) > POWER_ON_ALAT_MIN;
}

/** Metrics over sample indices [from, to) (defaults: every sample after the reset state). */
export function ggMetrics(tr: Trajectory, from = 1, to = tr.meta.sampleCount): GgMetrics {
  const { aLong, aLat } = tr.samples;
  let n = 0;
  let gripSum = 0;
  let trail = 0;
  let powerOn = 0;
  let braking = 0;
  let events = 0;
  let inEvent = false;
  let peakLat = 0;
  let peakBrake = 0;
  for (let i = Math.max(0, from); i < Math.min(to, tr.meta.sampleCount); i++) {
    const al = aLong[i]!;
    const at = aLat[i]!;
    n++;
    gripSum += Math.hypot(al, at) / TRACTION_ACCEL_MAX;
    if (isTrailBraking(al, at)) trail++;
    if (isPowerOnCornering(al, at)) powerOn++;
    if (al < 0) braking++;
    if (al < BRAKE_EVENT_ALONG) {
      if (!inEvent) events++;
      inEvent = true;
    } else inEvent = false;
    if (Math.abs(at) > peakLat) peakLat = Math.abs(at);
    if (al < peakBrake) peakBrake = al;
  }
  const share = (k: number) => (n ? k / n : 0);
  return {
    samples: n,
    gripUtilisation: n ? gripSum / n : 0,
    trailBrakingShare: share(trail),
    powerOnCorneringShare: share(powerOn),
    brakingShare: share(braking),
    brakeEvents: events,
    peakLateral: peakLat,
    peakBraking: peakBrake,
  };
}

/** Metrics per completed lap (from the laps table), in lap order. */
export function ggMetricsPerLap(tr: Trajectory): GgMetrics[] {
  const out: GgMetrics[] = [];
  for (const lap of tr.laps) {
    const end = lap.startStep + Math.round(lap.lapTimeSec / tr.meta.dt);
    out.push(ggMetrics(tr, Math.max(1, lap.startStep), end));
  }
  return out;
}

/** Sample indices for the last `seconds` before sample `index` (for the g-g trace). */
export function ggTraceRange(tr: Trajectory, index: number, seconds: number): [number, number] {
  const end = Math.max(0, Math.min(tr.meta.sampleCount - 1, index));
  const start = Math.max(0, end - Math.round(seconds / tr.meta.dt));
  return [start, end];
}
