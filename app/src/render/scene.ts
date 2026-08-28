/**
 * Pure drawing routines: (ctx, camera, data) → pixels. No React, no store, no
 * clock; the loop in TrackCanvas decides WHEN, these decide HOW.
 */
import type { Camera } from '../engine/camera';
import { worldToScreen } from '../engine/camera';
import type { Trajectory } from '../engine/schema';
import type { Track } from '../engine/track';
import type { CarSnapshot } from '../engine/trajectory';
import type { Palette } from './palette';

/** Render-only car dimensions (meters); physics uses the center point. */
export const CAR_LENGTH_M = 4.0;
export const CAR_WIDTH_M = 1.8;
/** Seconds of recent path drawn behind the car. */
export const TRAIL_SECONDS = 2.0;

function polyline(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: readonly (readonly [number, number])[],
  close: boolean,
): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [sx, sy] = worldToScreen(cam, x, y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  if (close) ctx.closePath();
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  track: Track,
  p: Palette,
): void {
  // surface: fill the outer ring, then cut the infield with the inner ring (even-odd)
  polyline(ctx, cam, track.leftEdge, true);
  const outer = ctx;
  outer.fillStyle = p.surfaceRaised;
  ctx.fill();
  polyline(ctx, cam, track.rightEdge, true);
  ctx.fillStyle = p.bg;
  ctx.fill();
  // which ring is outer depends on handedness; draw the fill both ways using even-odd
  ctx.beginPath();
  track.leftEdge.forEach(([x, y], i) => {
    const [sx, sy] = worldToScreen(cam, x, y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  track.rightEdge.forEach(([x, y], i) => {
    const [sx, sy] = worldToScreen(cam, x, y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = p.surfaceRaised;
  ctx.fill('evenodd');

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.muted;
  polyline(ctx, cam, track.leftEdge, true);
  ctx.stroke();
  polyline(ctx, cam, track.rightEdge, true);
  ctx.stroke();

  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  polyline(ctx, cam, track.centerline, true);
  ctx.stroke();
  ctx.setLineDash([]);

  // start line, perpendicular to segment 0
  const d = track.directions[0]!;
  const h = track.halfWidth;
  ctx.strokeStyle = p.text;
  ctx.lineWidth = 3;
  polyline(
    ctx,
    cam,
    [
      [track.start.x - d[1] * h, track.start.y + d[0] * h],
      [track.start.x + d[1] * h, track.start.y - d[0] * h],
    ],
    false,
  );
  ctx.stroke();
}

export function drawTrail(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tr: Trajectory,
  range: readonly [number, number],
  p: Palette,
): void {
  const [start, end] = range;
  if (end <= start) return;
  const s = tr.samples;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = start; i < end; i++) {
    const a = worldToScreen(cam, s.x[i]!, s.y[i]!);
    const b = worldToScreen(cam, s.x[i + 1]!, s.y[i + 1]!);
    const f = (i - start) / (end - start);
    ctx.globalAlpha = 0.15 + 0.85 * f;
    // colour by what the driver is doing: brake red, throttle green, coast muted
    const drive = s.drive[i]!;
    ctx.strokeStyle = drive < -0.05 ? p.brake : drive > 0.05 ? p.throttle : p.muted;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Ghost colours, in order of addition (design tokens; the primary keeps the accent). */
export const GHOST_COLOR_KEYS: readonly (keyof Palette)[] = [
  'lateral',
  'throttle',
  'muted',
  'text',
  'brake',
];

export interface CarStyle {
  readonly color: string;
  /** Ghosts are translucent and never draw a trail. */
  readonly ghost: boolean;
}

export function drawCar(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: CarSnapshot,
  p: Palette,
  style: CarStyle = { color: p.accent, ghost: false },
): void {
  const [sx, sy] = worldToScreen(cam, snap.x, snap.y);
  const L = CAR_LENGTH_M * cam.scale;
  const W = CAR_WIDTH_M * cam.scale;
  ctx.save();
  ctx.globalAlpha = style.ghost ? 0.55 : 1;
  ctx.translate(sx, sy);
  ctx.rotate(-snap.heading); // world CCW-positive → screen (y down) is clockwise
  ctx.fillStyle = snap.crashed ? p.brake : style.color;
  ctx.strokeStyle = p.text;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, Math.min(3, W / 3));
  ctx.fill();
  ctx.stroke();
  // nose marker
  ctx.fillStyle = p.text;
  ctx.beginPath();
  ctx.arc(L / 2 - W * 0.25, 0, Math.max(1.5, W * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (snap.crashed) {
    ctx.save();
    ctx.globalAlpha = style.ghost ? 0.55 : 1;
    ctx.strokeStyle = p.brake;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(L, 14), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export interface SceneCar {
  readonly trajectory: Trajectory;
  readonly snapshot: CarSnapshot;
  readonly style: CarStyle;
  /** Trail range for the primary; ghosts pass null. */
  readonly trail: readonly [number, number] | null;
}

/** Draw the whole frame: track, then every car (ghosts first so the primary is on top). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
  track: Track,
  cars: readonly SceneCar[],
  p: Palette,
): void {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);
  drawTrack(ctx, cam, track, p);
  const ghosts = cars.filter((c) => c.style.ghost);
  const primaries = cars.filter((c) => !c.style.ghost);
  for (const c of [...ghosts, ...primaries]) {
    if (c.trail) drawTrail(ctx, cam, c.trajectory, c.trail, p);
    drawCar(ctx, cam, c.snapshot, p, c.style);
  }
}
