/** Full turn in radians. */
export const TAU = 2 * Math.PI;

/**
 * Wrap an angle into the half-open interval (-π, π].
 *
 * The convention is SPEC §3.3: exactly π is representable, exactly -π is not
 * (it wraps to π). So `wrapAngle(-Math.PI) === Math.PI`.
 */
export function wrapAngle(theta: number): number {
  let a = theta % TAU; // (-TAU, TAU)
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  // `%` yields -0 for negative whole turns; normalize so 0 has one representation.
  return a === 0 ? 0 : a;
}
