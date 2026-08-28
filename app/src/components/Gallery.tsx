import { useEffect, useState } from 'react';
import {
  fetchManifest,
  focusCheckpoint,
  galleryRef,
  ghostCheckpoint,
  loadLanding,
} from '../data/loadGallery';
import { GALLERIES, LANDING } from '../data/galleries';
import { findEntry, type GalleryManifest } from '../engine/gallery';
import { formatLapTime } from '../engine/format';
import { selectPrimary, useTransport } from '../store/transport';
import { LapStrip } from './LapStrip';

export interface GalleryProps {
  /** Load the landing state on mount (off in tests). */
  autoload?: boolean;
}

export function Gallery({ autoload = true }: GalleryProps) {
  const [galleryId, setGalleryId] = useState<string>(LANDING.galleryId);
  const [loaded, setLoaded] = useState<{ id: string; manifest: GalleryManifest } | null>(null);
  const manifest = loaded?.id === galleryId ? loaded.manifest : null;
  const [trackId, setTrackId] = useState<string>(LANDING.trackId);
  const [error, setError] = useState<string | null>(null);
  const primary = useTransport(selectPrimary);
  const ref = galleryRef(galleryId);

  useEffect(() => {
    if (!autoload) return;
    const load =
      galleryId === LANDING.galleryId
        ? loadLanding(ref, LANDING.trackId, LANDING.focusStep, LANDING.ghostSteps)
        : fetchManifest(ref).then(async (m) => {
            const first = m.checkpoints[m.checkpoints.length - 1]!;
            const track = m.tracks[0]!;
            setTrackId(track);
            await focusCheckpoint(m, ref, first.step, track);
            return m;
          });
    load
      .then((m) => {
        setLoaded({ id: galleryId, manifest: m });
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [autoload, galleryId, ref]);

  const focusStep = primary?.trajectory.meta.checkpointStep ?? null;
  const primaryTrack = primary?.trajectory.meta.trackId;

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-brake/50 bg-surface px-3 py-2 text-xs text-brake"
      >
        gallery: {error}
      </p>
    );
  }
  if (!manifest) return <p className="text-xs text-muted">Loading gallery…</p>;

  return (
    <section aria-label="checkpoint gallery" className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
            Checkpoint gallery
          </h2>
          <select
            aria-label="gallery run"
            value={galleryId}
            onChange={(e) => setGalleryId(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text"
          >
            {GALLERIES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm font-medium text-text">{manifest.title}</p>
        <p className="text-xs text-muted">{manifest.description}</p>
      </div>
      <div role="tablist" aria-label="track" className="flex gap-1">
        {manifest.tracks.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === trackId}
            onClick={() => setTrackId(t)}
            className={`rounded-md border px-2 py-1 font-mono text-xs ${t === trackId ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:border-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <LapStrip
        manifest={manifest}
        trackId={trackId}
        focusStep={primaryTrack === trackId ? focusStep : null}
        onPick={(step) => void focusCheckpoint(manifest, ref, step, trackId)}
      />
      <ul className="flex flex-col gap-1">
        {manifest.checkpoints.map((cp) => {
          const entry = findEntry(cp, trackId);
          if (!entry) return null;
          const focused = primaryTrack === trackId && cp.step === focusStep;
          const canGhost = primaryTrack === trackId && !focused;
          return (
            <li
              key={cp.step}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${focused ? 'border-accent' : 'border-border'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-text">{cp.label}</span>
                  <span
                    className={`shrink-0 font-mono text-xs whitespace-nowrap tabular-nums ${entry.crashed ? 'text-brake' : 'text-muted'}`}
                  >
                    {entry.crashed
                      ? `crash @ ${Math.round(entry.distanceM)} m`
                      : formatLapTime(entry.bestLapSec ?? NaN)}
                  </span>
                </div>
                {cp.note && <p className="truncate text-xs text-muted">{cp.note}</p>}
              </div>
              <button
                type="button"
                aria-label={`focus ${cp.label} on ${trackId}`}
                aria-pressed={focused}
                onClick={() => void focusCheckpoint(manifest, ref, cp.step, trackId)}
                className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted hover:border-muted"
              >
                focus
              </button>
              <button
                type="button"
                aria-label={`ghost ${cp.label} on ${trackId}`}
                disabled={!canGhost}
                onClick={() => void ghostCheckpoint(manifest, ref, cp.step, trackId)}
                className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted hover:border-muted disabled:opacity-30"
              >
                ghost
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
