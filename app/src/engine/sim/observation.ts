/**
 * Observation v0, byte-for-byte the env's (`apex_trainer/env.py::_observe`):
 * [0:12] rays / max_length (right → left), [12] speed / v_max, [13] a_lat / A,
 * [14:16] previous APPLIED action (steer, drive). Float32, like the env.
 */
import type { Action } from './car';
import type { PhysicsConfig, RayConfig } from './config';
import type { RayHit } from './raycast';

export const OBS_SIZE = 16;

export function observe(
  rays: readonly RayHit[],
  speed: number,
  aLat: number,
  prevAction: Action,
  physics: PhysicsConfig,
  rayCfg: RayConfig,
): Float32Array {
  const obs = new Float32Array(rayCfg.count + 4);
  for (let i = 0; i < rays.length; i++) obs[i] = rays[i]!.distance / rayCfg.max_length;
  const n = rayCfg.count;
  obs[n] = speed / physics.v_max;
  obs[n + 1] = aLat / physics.traction_accel_max;
  obs[n + 2] = prevAction.steer;
  obs[n + 3] = prevAction.drive;
  return obs;
}
