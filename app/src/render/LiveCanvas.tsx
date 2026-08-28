/**
 * Live mode: the TS sim driven by the ONNX policy, inside the one rAF loop.
 * Fixed dt = 1/60 through an accumulator (never a variable timestep), at most
 * MAX_TICKS_PER_FRAME sim ticks per frame; per-tick inference is awaited, so
 * the frame is an async function guarded against re-entry. The recording is
 * pushed into the transport store at lap completions and at the end, so the
 * HUD's lap list, the g-g widget and ghosts reuse the replay code unchanged.
 */
import { useEffect, useRef } from 'react';
import { getTrack } from '../data/tracks';
import { MODELS } from '../data/models';
import { fitCamera, type Camera } from '../engine/camera';
import { frameDelta } from '../engine/clock';
import {
  createSession,
  isDone,
  observeSession,
  sessionSnapshot,
  sessionTrajectory,
  tickSession,
  type LiveSession,
} from '../engine/live';
import { DEFAULT_RAYS, PHYSICS_PRESETS } from '../engine/sim/config';
import { trailRange } from '../engine/trajectory';
import { loadOrtPolicy, type LivePolicy } from '../live/ortPolicy';
import { publish } from '../store/snapshotBus';
import { useLive } from '../store/live';
import { useTransport } from '../store/transport';
import { readPalette } from './palette';
import { TRAIL_SECONDS, drawScene } from './scene';

const PADDING_PX = 24;
export const MAX_TICKS_PER_FRAME = 4;
export const MAX_TICKS = 3600;

export interface LiveCanvasProps {
  /** Injected for tests; defaults to onnxruntime-web. */
  loadPolicy?: (url: string, label: string) => Promise<LivePolicy>;
}

export function LiveCanvas({ loadPolicy = loadOrtPolicy }: LiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runId = useLive((s) => s.runId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || runId === 0) return;
    const { trackId, modelId, setStatus, setTickRate } = useLive.getState();
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) {
      setStatus('error', `unknown model ${modelId}`);
      return;
    }
    const track = getTrack(trackId);
    const ctx = canvas.getContext('2d');
    const palette = readPalette();
    let cancelled = false;
    let raf = 0;

    let width = 1;
    let height = 1;
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

    const preset = PHYSICS_PRESETS[model.physics];
    const session: LiveSession = createSession({
      track,
      physics: preset.physics,
      rays: DEFAULT_RAYS,
      physicsConfigHash: preset.hash,
      policyLabel: `live · ${model.label}`,
      maxTicks: MAX_TICKS,
    });
    const createdAt = new Date().toISOString();
    const pushRecording = () =>
      useTransport
        .getState()
        .setTrajectory(sessionTrajectory(session, createdAt), `live · ${model.label} · ${trackId}`);

    const draw = () => {
      if (!ctx) return;
      const tr = sessionTrajectory(session, createdAt);
      const snap = sessionSnapshot(session);
      drawScene(
        ctx,
        camera,
        width,
        height,
        track,
        [
          {
            trajectory: tr,
            snapshot: snap,
            style: { color: palette.accent, ghost: false },
            trail: trailRange(tr, snap.t, TRAIL_SECONDS),
          },
        ],
        palette,
      );
    };

    let policy: LivePolicy | null = null;
    let prevMs: number | null = null;
    let acc = 0;
    let busy = false;
    let lapsSeen = 0;
    let rateTicks = 0;
    let rateSince = 0;
    const dt = preset.physics.dt;

    const frame = async (nowMs: number) => {
      if (cancelled) return;
      if (busy) {
        raf = requestAnimationFrame((t) => void frame(t));
        return;
      }
      busy = true;
      try {
        acc += frameDelta(prevMs, nowMs);
        prevMs = nowMs;
        let ticks = 0;
        while (policy && acc >= dt && ticks < MAX_TICKS_PER_FRAME && !isDone(session)) {
          const action = await policy.act(observeSession(session));
          if (cancelled) return;
          tickSession(session, action);
          acc -= dt;
          ticks++;
          rateTicks++;
        }
        if (acc > dt * MAX_TICKS_PER_FRAME) acc = 0; // fell behind: drop time, never fast-forward
        if (session.world.laps > lapsSeen) {
          lapsSeen = session.world.laps;
          pushRecording();
        }
        if (rateSince === 0) rateSince = nowMs;
        if (nowMs - rateSince >= 500) {
          setTickRate(Math.round((rateTicks * 1000) / (nowMs - rateSince)));
          rateTicks = 0;
          rateSince = nowMs;
        }
        draw();
        publish(sessionSnapshot(session), nowMs, ticks > 0);
        if (isDone(session)) {
          pushRecording();
          setStatus(session.world.crashed ? 'crashed' : 'finished');
          useTransport.getState().pause();
          return; // stop the loop; the last frame stays on screen
        }
      } finally {
        busy = false;
      }
      raf = requestAnimationFrame((t) => void frame(t));
    };

    draw();
    pushRecording(); // the HUD follows the live car from tick 0
    publish(sessionSnapshot(session), 0, true);
    loadPolicy(model.file, model.label)
      .then((p) => {
        if (cancelled) return;
        policy = p;
        setStatus('driving');
        raf = requestAnimationFrame((t) => void frame(t));
      })
      .catch((e: unknown) => setStatus('error', e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [runId, loadPolicy]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="live drive"
      className="block h-full w-full rounded-lg border border-border bg-bg"
    />
  );
}
