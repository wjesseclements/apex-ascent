import { useState, type ChangeEvent } from 'react';
import { loadFile, loadSample } from '../data/loadTrajectory';
import { SAMPLES } from '../data/samples';
import { selectPrimary, useTransport } from '../store/transport';

export function TrajectoryPicker() {
  const name = useTransport((s) => selectPrimary(s)?.label ?? null);
  const error = useTransport((s) => s.loadError);
  const [busy, setBusy] = useState(false);

  const pick = async (id: string) => {
    setBusy(true);
    try {
      await loadSample(id);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = '';
  };

  return (
    <section className="flex flex-col gap-3" aria-label="trajectory picker">
      <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Trajectory</h2>
      <ul className="flex flex-col gap-2">
        {SAMPLES.map((s) => {
          const active = name === s.label;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void pick(s.id)}
                disabled={busy}
                aria-pressed={active}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-text'
                    : 'border-border bg-surface text-text hover:border-muted'
                }`}
              >
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-muted">{s.blurb}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="text-xs text-muted">
        <span className="mb-1 block">Open a trajectory JSON exported by the trainer</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          aria-label="open trajectory file"
          className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1 file:text-text"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-brake/50 bg-surface px-3 py-2 text-xs text-brake"
        >
          {error}
        </p>
      )}
    </section>
  );
}
