/** Port of the parts of `sim/geometry.py` the sim needs beyond engine/geometry.ts. */
export function point_segment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): [number, number] {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  return [t, dx * dx + dy * dy];
}
