/**
 * The one requestAnimationFrame loop. It owns the live clock (in a ref — never
 * React or store state), reads the transport store with `getState()` inside the
 * frame (no subscription ⇒ no re-render on play/pause/speed), advances the
 * clock by the engine's rule, draws, and publishes a snapshot to the HUD bus at
 * ≤30 Hz. The component itself re-renders only when a different trajectory is
 * loaded.
 */
import { useEffect, useRef } from 'react';
import { fitCamera, type Camera } from '../engine/camera';
import { advanceClock, frameDelta } from '../engine/clock';
import { duration, snapshotAt, trailRange, wrapClock } from '../engine/trajectory';
import { publish } from '../store/snapshotBus';
import { selectTrajectory, useTransport } from '../store/transport';
import { readPalette } from './palette';
import { GHOST_COLOR_KEYS, TRAIL_SECONDS, drawScene, type SceneCar } from './scene';

const PADDING_PX = 24;

export function TrackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-render (and restart the loop) only when the set of cars or the focus changes —
  // never per frame, never on play/pause/speed/seek.
  const cars = useTransport((s) => s.cars);
  const focusIndex = useTransport((s) => s.focusIndex);
  const trajectory = selectTrajectory({ cars, focusIndex });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trajectory) return;
    const track = useTransport.getState().track;
    if (!track) return;
    const ghosts = cars.filter((_, i) => i !== focusIndex);
    const ctx = canvas.getContext('2d');
    const palette = readPalette();
    const dur = duration(trajectory);

    let width = 0;
    let height = 0;
    let camera: Camera = fitCamera(track.bounds, 1, 1, PADDING_PX);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera = fitCamera(track.bounds, width, height, PADDING_PX);
    };
    resize();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
    observer?.observe(canvas);

    // The clock: a ref-like closure variable, owned by this loop alone.
    let clock = 0;
    let prevMs: number | null = null;
    let raf = 0;
    const frame = (nowMs: number) => {
      const state = useTransport.getState();
      if (state.seekTarget !== null) {
        clock = wrapClock(state.seekTarget, dur);
        state.consumeSeek();
      }
      const dt = frameDelta(prevMs, nowMs);
      prevMs = nowMs;
      if (state.isPlaying) clock = advanceClock(clock, dt, state.speedMult, dur);
      const snap = snapshotAt(trajectory, clock);
      if (ctx) {
        const scene: SceneCar[] = ghosts.map((g, i) => ({
          trajectory: g.trajectory,
          // a ghost that has ended freezes at its last sample (its crash ring stays)
          snapshot: snapshotAt(g.trajectory, Math.min(clock, duration(g.trajectory))),
          style: { color: palette[GHOST_COLOR_KEYS[i % GHOST_COLOR_KEYS.length]!], ghost: true },
          trail: null,
        }));
        scene.push({
          trajectory,
          snapshot: snap,
          style: { color: palette.accent, ghost: false },
          trail: trailRange(trajectory, clock, TRAIL_SECONDS),
        });
        drawScene(ctx, camera, width, height, track, scene, palette);
      }
      publish(snap, nowMs);
      raf = requestAnimationFrame(frame);
    };
    publish(snapshotAt(trajectory, 0), 0, true);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [cars, focusIndex, trajectory]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="track replay"
      className="block h-full w-full rounded-lg border border-border bg-bg"
    />
  );
}
