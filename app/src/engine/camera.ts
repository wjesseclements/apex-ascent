/**
 * World ↔ screen mapping. The ONLY place the y-flip happens (SPEC §3.3: the
 * canvas layer owns it; the trainer never thinks about screens).
 *
 * screen = [offsetX + x · scale, offsetY − y · scale]
 */
import type { Bounds } from './track';

export interface Camera {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Fit `bounds` into a viewport with `padding` px on every side, preserving aspect. */
export function fitCamera(bounds: Bounds, width: number, height: number, padding: number): Camera {
  const w = Math.max(1e-9, bounds.maxX - bounds.minX);
  const h = Math.max(1e-9, bounds.maxY - bounds.minY);
  const innerW = Math.max(1, width - 2 * padding);
  const innerH = Math.max(1, height - 2 * padding);
  const scale = Math.min(innerW / w, innerH / h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 + cy * scale };
}

export function worldToScreen(cam: Camera, x: number, y: number): [number, number] {
  return [cam.offsetX + x * cam.scale, cam.offsetY - y * cam.scale];
}

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.offsetX) / cam.scale, (cam.offsetY - sy) / cam.scale];
}
