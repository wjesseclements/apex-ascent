/**
 * Physics and ray configs — the TS mirror of `trainer/apex_trainer/config.py`
 * (PhysicsConfig, RayConfig). Values come from the trajectory/parity fixture
 * or from these defaults; the constants below equal the Python defaults and
 * are pinned by the parity tests.
 */
export interface PhysicsConfig {
  readonly dt: number;
  readonly traction_accel_max: number;
  readonly throttle_accel_max: number;
  readonly brake_accel_max: number;
  readonly v_max: number;
  readonly drag: number;
  readonly steer_rate: number;
  readonly start_speed: number;
}

export interface RayConfig {
  readonly count: number;
  readonly half_fan: number;
  readonly max_length: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  dt: 1 / 60,
  traction_accel_max: 20,
  throttle_accel_max: 12,
  brake_accel_max: 20,
  v_max: 30,
  drag: 0.3,
  steer_rate: 2.5,
  start_speed: 2,
};

export const DEFAULT_RAYS: RayConfig = { count: 12, half_fan: Math.PI / 2, max_length: 60 };

/** Evenly spaced offsets from −half_fan (right) to +half_fan (left); mirrors RayConfig.offsets(). */
export function rayOffsets(cfg: RayConfig): number[] {
  if (cfg.count < 2) return [0];
  const step = (2 * cfg.half_fan) / (cfg.count - 1);
  return Array.from({ length: cfg.count }, (_, i) => -cfg.half_fan + i * step);
}
