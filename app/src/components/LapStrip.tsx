/**
 * Per-checkpoint lap-time strip: best lap vs training step for one track,
 * crashes as red marks at the top. Click a point to focus that checkpoint.
 * Pure SVG from manifest data — no per-frame state.
 */
import { findEntry, type GalleryManifest } from '../engine/gallery';
import { formatLapTime } from '../engine/format';

const W = 320;
const H = 110;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

export interface LapStripProps {
  manifest: GalleryManifest;
  trackId: string;
  focusStep: number | null;
  onPick: (step: number) => void;
}

export function LapStrip({ manifest, trackId, focusStep, onPick }: LapStripProps) {
  const points = manifest.checkpoints
    .map((c) => ({ step: c.step, label: c.label, entry: findEntry(c, trackId) }))
    .filter((p) => p.entry !== undefined);
  if (points.length === 0) return null;
  const laps = points.map((p) => p.entry!.bestLapSec).filter((v): v is number => v !== null);
  const lo = laps.length ? Math.min(...laps) : 0;
  const hi = laps.length ? Math.max(...laps) : 1;
  const yMin = Math.floor(lo - 0.5);
  const yMax = Math.ceil(hi + 0.5);
  const steps = points.map((p) => Math.max(p.step, 1));
  const xMin = Math.log10(Math.min(...steps));
  const xMax = Math.log10(Math.max(...steps));
  const x = (step: number) =>
    PAD.l +
    ((Math.log10(Math.max(step, 1)) - xMin) / Math.max(1e-9, xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (lap: number) =>
    PAD.t + ((lap - yMin) / Math.max(1e-9, yMax - yMin)) * (H - PAD.t - PAD.b);
  const clean = points.filter((p) => p.entry!.bestLapSec !== null);
  const path = clean
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${x(p.step).toFixed(1)},${y(p.entry!.bestLapSec!).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`best lap per checkpoint on ${trackId}`}
      className="w-full"
    >
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={H - PAD.b}
        y2={H - PAD.b}
        className="stroke-border"
        strokeWidth={1}
      />
      <text x={2} y={PAD.t + 4} className="fill-muted font-mono text-[9px]">
        {formatLapTime(yMin)}
      </text>
      <text x={2} y={H - PAD.b} className="fill-muted font-mono text-[9px]">
        {formatLapTime(yMax)}
      </text>
      <path d={path} fill="none" className="stroke-muted" strokeWidth={1.5} />
      {points.map((p) => {
        const e = p.entry!;
        const focused = p.step === focusStep;
        const cx = x(p.step);
        const cy = e.bestLapSec === null ? PAD.t : y(e.bestLapSec);
        return (
          <g
            key={p.step}
            onClick={() => onPick(p.step)}
            className="cursor-pointer"
            role="button"
            aria-label={`${p.label}: ${e.crashed ? 'crash' : formatLapTime(e.bestLapSec ?? NaN)}`}
          >
            {e.crashed ? (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                className="fill-brake font-mono text-[11px]"
              >
                ×
              </text>
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={focused ? 5 : 3.5}
                className={focused ? 'fill-accent' : 'fill-text'}
              />
            )}
            <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted font-mono text-[8px]">
              {p.label.split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
