/**
 * Port of `sim/car.py`: the 2-D kinematic car under traction-circle physics.
 * Same tick order, same sign conventions (steer +1 = right = negative heading
 * rate), same "ω = k · ω_cmd" guard at v = 0, same reporting (traction-scaled
 * commanded a_long / a_lat, drag excluded). See the Python docstring.
 */
import { wrapAngle } from '../angle';
import type { PhysicsConfig } from './config';

export interface CarState {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly speed: number;
}

export interface Action {
  readonly steer: number;
  readonly drive: number;
}

export interface StepResult {
  readonly state: CarState;
  readonly aLong: number;
  readonly aLat: number;
}

const clampUnit = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

export function clampAction(a: Action): Action {
  return { steer: clampUnit(a.steer), drive: clampUnit(a.drive) };
}

export function stepCar(state: CarState, action: Action, cfg: PhysicsConfig): StepResult {
  const { steer, drive } = clampAction(action);
  const v = state.speed;

  const aLongCmd = drive * (drive >= 0 ? cfg.throttle_accel_max : cfg.brake_accel_max);
  const omegaCmd = -steer * cfg.steer_rate * (v / cfg.v_max);
  const aLatCmd = v * omegaCmd;

  const aMax = cfg.traction_accel_max;
  const mag = Math.hypot(aLongCmd, aLatCmd);
  const k = mag > aMax ? aMax / mag : 1;
  const aLong = aLongCmd * k;
  const aLat = aLatCmd * k;
  const omega = omegaCmd * k;

  let speed = v + aLong * cfg.dt;
  if (speed < 0) speed = 0;
  else if (speed > cfg.v_max) speed = cfg.v_max;
  speed *= 1 - cfg.drag * cfg.dt;

  const heading = wrapAngle(state.heading + omega * cfg.dt);
  const x = state.x + Math.cos(heading) * speed * cfg.dt;
  const y = state.y + Math.sin(heading) * speed * cfg.dt;
  return { state: { x, y, heading, speed }, aLong, aLat };
}
