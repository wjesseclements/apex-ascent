/**
 * The traction-circle ("g-g") widget: lateral acceleration on x, longitudinal
 * on y, the grip budget A as the circle. A dot for the current tick and a
 * trace of the last few seconds. SVG driven from the ≤30 Hz snapshot bus
 * (rule 1: HUD-rate, never per frame); the trace comes straight from the
 * samples, so it needs no state of its own.
 */
import { formatLapTime } from '../engine/format';
import { TRACTION_ACCEL_MAX, ggMetrics, ggTraceRange, isTrailBraking } from '../engine/gg';
import { useCarSnapshot } from '../store/snapshotBus';
import { selectTrajectory, useTransport } from '../store/transport';

const SIZE = 220;
const R = 90; // px for A
const C = SIZE / 2;
export const TRACE_SECONDS = 2;

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function GgWidget() {
  const trajectory = useTransport(selectTrajectory);
  const snap = useCarSnapshot();
  if (!trajectory || !snap) return null;
  const k = R / TRACTION_ACCEL_MAX;
  // x = lateral (left positive in the world frame → draw left to the left), y = longitudinal (brake down)
  const px = (aLat: number) => C - aLat * k;
  const py = (aLong: number) => C - aLong * k;
  const [from, to] = ggTraceRange(trajectory, snap.index, TRACE_SECONDS);
  const s = trajectory.samples;
  const trace = [];
  for (let i = from; i <= to; i++) {
    trace.push(
      `${i === from ? 'M' : 'L'}${px(s.aLat[i]!).toFixed(1)},${py(s.aLong[i]!).toFixed(1)}`,
    );
  }
  const m = ggMetrics(trajectory);
  const trailNow = isTrailBraking(snap.aLong, snap.aLat);
  const usage = Math.hypot(snap.aLong, snap.aLat) / TRACTION_ACCEL_MAX;
  return (
    <section aria-label="traction circle" className="flex flex-col gap-2">
      <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Traction circle</h2>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="g-g diagram"
        className="w-full max-w-[220px] self-center"
      >
        {/* trail-braking zone: braking with lateral load (both sides), drawn first */}
        <path
          d={`M${px(-TRACTION_ACCEL_MAX)},${py(-2)} A${R},${R} 0 0 0 ${px(TRACTION_ACCEL_MAX)},${py(-2)} L${px(4)},${py(-2)} L${px(4)},${py(-2)} Z`}
          className="fill-brake/10"
        />
        <circle cx={C} cy={C} r={R} className="fill-surface-raised stroke-border" strokeWidth={1} />
        <line x1={C - R} x2={C + R} y1={C} y2={C} className="stroke-border" strokeWidth={1} />
        <line x1={C} x2={C} y1={C - R} y2={C + R} className="stroke-border" strokeWidth={1} />
        <text x={C + 4} y={C - R + 12} className="fill-throttle font-mono text-[9px]">
          throttle
        </text>
        <text x={C + 4} y={C + R - 4} className="fill-brake font-mono text-[9px]">
          brake
        </text>
        <text x={C - R + 2} y={C - 4} className="fill-lateral font-mono text-[9px]">
          left
        </text>
        <text x={C + R - 26} y={C - 4} className="fill-lateral font-mono text-[9px]">
          right
        </text>
        <path
          d={trace.join(' ')}
          fill="none"
          className="stroke-accent"
          strokeWidth={1.5}
          strokeOpacity={0.7}
        />
        <circle
          cx={px(snap.aLat)}
          cy={py(snap.aLong)}
          r={5}
          className={trailNow ? 'fill-brake' : 'fill-accent'}
        />
      </svg>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
        <span className="text-muted">grip now</span>
        <span className="text-text">{pct(usage)}</span>
        <span className="text-muted">grip used (mean)</span>
        <span className="text-text">{pct(m.gripUtilisation)}</span>
        <span className="text-muted">braking ticks</span>
        <span className="text-text">{pct(m.brakingShare)}</span>
        <span className="text-muted">trail-braking ticks</span>
        <span className={m.trailBrakingShare > 0.01 ? 'text-brake' : 'text-text'}>
          {pct(m.trailBrakingShare)}
        </span>
        <span className="text-muted">power-on cornering</span>
        <span className="text-text">{pct(m.powerOnCorneringShare)}</span>
        <span className="text-muted">brake events</span>
        <span className="text-text">{m.brakeEvents}</span>
        <span className="text-muted">peak lateral</span>
        <span className="text-text">{m.peakLateral.toFixed(1)} m/s²</span>
        <span className="text-muted">episode</span>
        <span className="text-text">
          {formatLapTime((trajectory.meta.sampleCount - 1) * trajectory.meta.dt)}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        Trail-braking tick: brake harder than 2 m/s² while |lateral| &gt; 4 m/s². <code>aLong</code>{' '}
        excludes drag — lifting reads as 0, so coasting never counts as braking.
      </p>
    </section>
  );
}
