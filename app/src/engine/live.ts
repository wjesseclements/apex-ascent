/**
 * Live driving session (Slice 8b): the TS sim stepped at a fixed dt by a
 * policy's actions, recording samples into the same Trajectory shape the
 * replay uses — so the HUD, g-g widget, lap counter and ghosts need no new
 * code. Pure: the policy is an injected function; no ORT, no DOM here.
 *
 * Closed-loop determinism note (SPEC §9): the sim is bit-identical to Python
 * tick for tick on recorded actions; a live run diverges from a recorded
 * replay of the same checkpoint only through last-ulp differences fed back
 * through the policy over many ticks — "visually matches", not "identical".
 */
import type { Trajectory } from './schema';
import { SCHEMA_VERSION } from './schema';
import type { Action } from './sim/car';
import type { PhysicsConfig, RayConfig } from './sim/config';
import { observe } from './sim/observation';
import { reset, sense, step, type WorldState } from './sim/world';
import type { Track } from './track';
import type { CarSnapshot } from './trajectory';

export interface LiveConfig {
  readonly track: Track;
  readonly physics: PhysicsConfig;
  readonly rays: RayConfig;
  readonly physicsConfigHash: string;
  readonly policyLabel: string;
  /** Ticks after which the session truncates (the env's max_steps). */
  readonly maxTicks: number;
}

export interface LiveSession {
  readonly cfg: LiveConfig;
  world: WorldState;
  prevAction: Action;
  aLong: number;
  aLat: number;
  /** Recorded columns, sample 0 = reset state. */
  readonly rec: {
    t: number[];
    x: number[];
    y: number[];
    heading: number[];
    speed: number[];
    steer: number[];
    drive: number[];
    aLong: number[];
    aLat: number[];
  };
}

function record(s: LiveSession): void {
  const c = s.world.car;
  s.rec.t.push(s.world.tick * s.cfg.physics.dt);
  s.rec.x.push(c.x);
  s.rec.y.push(c.y);
  s.rec.heading.push(c.heading);
  s.rec.speed.push(c.speed);
  s.rec.steer.push(s.prevAction.steer);
  s.rec.drive.push(s.prevAction.drive);
  s.rec.aLong.push(s.aLong);
  s.rec.aLat.push(s.aLat);
}

export function createSession(cfg: LiveConfig): LiveSession {
  const s: LiveSession = {
    cfg,
    world: reset(cfg.track, cfg.physics),
    prevAction: { steer: 0, drive: 0 },
    aLong: 0,
    aLat: 0,
    rec: { t: [], x: [], y: [], heading: [], speed: [], steer: [], drive: [], aLong: [], aLat: [] },
  };
  record(s);
  return s;
}

/** The observation the policy sees now (obs v0, float32). */
export function observeSession(s: LiveSession): Float32Array {
  return observe(
    sense(s.cfg.track, s.world, s.cfg.rays),
    s.world.car.speed,
    s.aLat,
    s.prevAction,
    s.cfg.physics,
    s.cfg.rays,
  );
}

export function isDone(s: LiveSession): boolean {
  return s.world.crashed || s.world.tick >= s.cfg.maxTicks;
}

/** Apply one action for one fixed tick. No-op once done. */
export function tickSession(s: LiveSession, action: Action): void {
  if (isDone(s)) return;
  const [world, t] = step(s.cfg.track, s.world, action, s.cfg.physics);
  s.world = world;
  s.prevAction = {
    steer: Math.max(-1, Math.min(1, action.steer)),
    drive: Math.max(-1, Math.min(1, action.drive)),
  };
  s.aLong = t.aLong;
  s.aLat = t.aLat;
  record(s);
}

/** The current state as a replay-style snapshot (for the HUD bus and the g-g widget). */
export function sessionSnapshot(s: LiveSession): CarSnapshot {
  const w = s.world;
  const idx = w.tick;
  return {
    t: idx * s.cfg.physics.dt,
    x: w.car.x,
    y: w.car.y,
    heading: w.car.heading,
    speed: w.car.speed,
    steer: s.prevAction.steer,
    drive: s.prevAction.drive,
    aLong: s.aLong,
    aLat: s.aLat,
    index: idx,
    lap: w.laps + 1,
    lapClock: (w.tick - w.lapStartTick) * s.cfg.physics.dt,
    crashed: w.crashed,
  };
}

/** The recording so far as a schema-valid Trajectory (usable as a replay or a ghost). */
export function sessionTrajectory(s: LiveSession, createdAt: string): Trajectory {
  const w = s.world;
  const laps = [];
  let start = 0;
  for (const lapTime of w.lapTimes) {
    laps.push({ lapTimeSec: lapTime, startStep: start });
    start += Math.round(lapTime / s.cfg.physics.dt);
  }
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      runId: 'live',
      checkpointStep: null,
      policy: s.cfg.policyLabel,
      trackId: s.cfg.track.name,
      physicsConfigHash: s.cfg.physicsConfigHash,
      seed: 0,
      dt: s.cfg.physics.dt,
      createdAt,
      sampleCount: s.rec.t.length,
      crashed: w.crashed,
    },
    laps,
    samples: { ...s.rec },
  };
}
