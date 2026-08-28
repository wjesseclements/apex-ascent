import { formatLapTime, formatSpeedKmh } from '../engine/format';
import { useCarSnapshot } from '../store/snapshotBus';
import { useTransport } from '../store/transport';

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">{label}</span>
      <span className="font-mono text-2xl text-text tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
      </span>
    </div>
  );
}

export function Hud() {
  const trajectory = useTransport((s) => s.trajectory);
  const name = useTransport((s) => s.trajectoryName);
  const snap = useCarSnapshot();
  if (!trajectory || !snap) {
    return (
      <section aria-label="hud" className="text-sm text-muted">
        No trajectory loaded.
      </section>
    );
  }
  const laps = trajectory.laps;
  const best = laps.length ? Math.min(...laps.map((l) => l.lapTimeSec)) : null;
  return (
    <section aria-label="hud" className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-text">{name}</p>
        <p className="font-mono text-xs text-muted">
          {trajectory.meta.policy} · {trajectory.meta.trackId} · physics{' '}
          {trajectory.meta.physicsConfigHash}
        </p>
      </div>
      {snap.crashed && (
        <p
          role="status"
          className="rounded-md border border-brake bg-surface px-3 py-2 font-mono text-sm text-brake"
        >
          CRASH at {formatLapTime(snap.t)} s
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="speed" value={formatSpeedKmh(snap.speed)} unit="km/h" />
        <Stat label="lap clock" value={formatLapTime(snap.lapClock)} />
      </div>
      <Stat label="lap" value={`${snap.lap}`} unit={`· ${snap.lap - 1} completed`} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="steer" value={snap.steer.toFixed(2)} />
        <Stat label="drive" value={snap.drive.toFixed(2)} />
      </div>
      <div>
        <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
          Lap times
        </p>
        {laps.length === 0 ? (
          <p className="text-sm text-muted">No completed laps.</p>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-sm tabular-nums">
            {laps.map((l, i) => (
              <li
                key={l.startStep}
                className={`flex justify-between ${snap.lap === i + 1 ? 'text-text' : 'text-muted'}`}
              >
                <span>Lap {i + 1}</span>
                <span className={l.lapTimeSec === best ? 'text-throttle' : ''}>
                  {formatLapTime(l.lapTimeSec)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
