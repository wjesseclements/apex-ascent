import { TRACK_IDS } from '../data/tracks';
import { MODELS } from '../data/models';
import { useLive } from '../store/live';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Pick a track and a model, then start.',
  loading: 'Loading the policy (onnxruntime-web)…',
  driving: 'Driving live — the network decides every tick.',
  crashed: 'Crashed. The ring marks where.',
  finished: '60 s done.',
  error: 'Could not start.',
};

export function LivePanel() {
  const { trackId, modelId, status, error, tickRate } = useLive();
  const { setTrack, setModel, start } = useLive.getState();
  const busy = status === 'loading' || status === 'driving';
  return (
    <section aria-label="live controls" className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        track
        <select
          aria-label="live track"
          value={trackId}
          disabled={busy}
          onChange={(e) => setTrack(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text"
        >
          {TRACK_IDS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        model
        <select
          aria-label="live model"
          value={modelId}
          disabled={busy}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-md border border-accent bg-accent-soft px-4 py-2 font-mono text-sm text-text disabled:opacity-40"
      >
        {status === 'idle' ? 'start' : 'restart'}
      </button>
      <span
        role="status"
        className={`text-xs ${status === 'error' || status === 'crashed' ? 'text-brake' : 'text-muted'}`}
      >
        {STATUS_TEXT[status]}
        {error ? ` ${error}` : ''}
        {status === 'driving' && tickRate > 0 ? ` · ${tickRate} ticks/s` : ''}
      </span>
    </section>
  );
}
