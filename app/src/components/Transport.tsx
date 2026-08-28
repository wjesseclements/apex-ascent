import { useEffect } from 'react';
import { formatLapTime, formatSpeedMult } from '../engine/format';
import { duration } from '../engine/trajectory';
import { useCarSnapshot } from '../store/snapshotBus';
import { SPEED_OPTIONS, useTransport } from '../store/transport';

export function Transport() {
  const trajectory = useTransport((s) => s.trajectory);
  const isPlaying = useTransport((s) => s.isPlaying);
  const speedMult = useTransport((s) => s.speedMult);
  const { togglePlay, setSpeed, seek } = useTransport.getState();
  const snap = useCarSnapshot();
  const dur = trajectory ? duration(trajectory) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        useTransport.getState().togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const disabled = trajectory === null;
  return (
    <section className="flex flex-wrap items-center gap-3" aria-label="transport controls">
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        aria-label={isPlaying ? 'pause' : 'play'}
        className="rounded-md border border-border bg-surface-raised px-4 py-2 font-mono text-sm text-text hover:border-muted disabled:opacity-40"
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        aria-label="scrub"
        min={0}
        max={dur}
        step={trajectory?.meta.dt ?? 0.01}
        value={snap?.t ?? 0}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={disabled}
        className="min-w-40 flex-1 accent-accent"
      />
      <span className="font-mono text-sm whitespace-nowrap text-muted tabular-nums">
        {formatLapTime(snap?.t ?? 0)} / {formatLapTime(dur)}
      </span>
      <div role="group" aria-label="playback speed" className="flex gap-1">
        {SPEED_OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSpeed(m)}
            aria-pressed={speedMult === m}
            disabled={disabled}
            className={`rounded-md border px-2 py-1 font-mono text-xs ${
              speedMult === m
                ? 'border-accent bg-accent-soft text-text'
                : 'border-border text-muted hover:border-muted'
            } disabled:opacity-40`}
          >
            {formatSpeedMult(m)}
          </button>
        ))}
      </div>
    </section>
  );
}
