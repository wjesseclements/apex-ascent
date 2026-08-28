/** 2-D vector helpers on readonly tuples. World frame: x right, y up, meters. */
export type Vec2 = readonly [number, number];

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
/** 2-D cross product (z component); positive when b is CCW of a. */
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const length = (a: Vec2): number => Math.hypot(a[0], a[1]);
/** Rotate +90° (CCW): the left of travel direction `d` in a y-up frame. */
export const leftNormal = (d: Vec2): Vec2 => [-d[1], d[0]];

export function normalize(a: Vec2): Vec2 {
  const n = length(a);
  if (n === 0) throw new Error('cannot normalize a zero vector');
  return [a[0] / n, a[1] / n];
}
