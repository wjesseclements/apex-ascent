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
import { useTransport } from '../store/transport';
import { readPalette } from './palette';
import { TRAIL_SECONDS, drawScene } from './scene';

const PADDING_PX = 24;

export function TrackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trajectory = useTransport((s) => s.trajectory);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trajectory) return;
    const track = useTransport.getState().track;
    if (!track) return;
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
        drawScene(
          ctx,
          camera,
          width,
          height,
          track,
          trajectory,
          snap,
          trailRange(trajectory, clock, TRAIL_SECONDS),
          palette,
        );
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
  }, [trajectory]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="track replay"
      className="block h-full w-full rounded-lg border border-border bg-bg"
    />
  );
}
