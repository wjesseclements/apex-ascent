import { useEffect, useState } from 'react';
import {
  fetchManifest,
  focusCheckpoint,
  galleryRef,
  ghostCheckpoint,
  loadLanding,
  loadPreset,
} from '../data/loadGallery';
import { GALLERIES, LANDING } from '../data/galleries';
import { PRESETS, findPreset } from '../data/presets';
import { findEntry, type GalleryManifest } from '../engine/gallery';
import { formatLapTime } from '../engine/format';
import { selectPrimary, useTransport } from '../store/transport';
import { LapStrip } from './LapStrip';

export interface GalleryProps {
  /** Load the landing state (or the deep-linked preset) on mount; off in tests. */
  autoload?: boolean;
  /** A preset id from the URL, applied instead of the landing state. */
  initialPreset?: string;
}

interface Loaded {
  id: string;
  manifest: GalleryManifest;
}

export function Gallery({ autoload = true, initialPreset }: GalleryProps) {
  const [galleryId, setGalleryId] = useState<string>(
    findPreset(initialPreset ?? '')?.galleryId ?? LANDING.galleryId,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [trackId, setTrackId] = useState<string>(
    findPreset(initialPreset ?? '')?.trackId ?? LANDING.trackId,
  );
  const [error, setError] = useState<string | null>(null);
  // Ghost steps the user has chosen, remembered per gallery so they survive track-tab
  // switches (Slice 9 polish): switching tracks re-applies those evaluated there.
  const [ghostSteps, setGhostSteps] = useState<number[]>([...LANDING.ghostSteps]);
  const primary = useTransport(selectPrimary);
  const ref = galleryRef(galleryId);
  const manifest = loaded?.id === galleryId ? loaded.manifest : null;

  useEffect(() => {
    if (!autoload) return;
    const preset = findPreset(initialPreset ?? '');
    const load =
      preset && preset.galleryId === galleryId
        ? loadPreset(preset).then((m) => {
            setGhostSteps([...preset.ghostSteps]);
            return m;
          })
        : galleryId === LANDING.galleryId
          ? loadLanding(ref, LANDING.trackId, LANDING.focusStep, LANDING.ghostSteps)
          : fetchManifest(ref).then(async (m) => {
              const last = m.checkpoints[m.checkpoints.length - 1]!;
              const track = m.tracks[0]!;
              setTrackId(track);
              await focusCheckpoint(m, ref, last.step, track);
              return m;
            });
    load
      .then((m) => {
        setLoaded({ id: galleryId, manifest: m });
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [autoload, galleryId, initialPreset, ref]);

  const focusStep = primary?.trajectory.meta.checkpointStep ?? null;
  const primaryTrack = primary?.trajectory.meta.trackId;

  /** Focus a checkpoint on a track and re-apply the remembered ghosts that exist there. */
  const focusWithGhosts = async (m: GalleryManifest, step: number, track: string) => {
    await focusCheckpoint(m, ref, step, track);
    for (const g of ghostSteps) {
      if (g === step) continue;
      const cp = m.checkpoints.find((c) => c.step === g);
      if (cp && findEntry(cp, track)) await ghostCheckpoint(m, ref, g, track);
    }
  };

  const applyPreset = async (id: string) => {
    const preset = findPreset(id);
    if (!preset) return;
    setError(null);
    setGalleryId(preset.galleryId);
    setTrackId(preset.trackId);
    setGhostSteps([...preset.ghostSteps]);
    try {
      const m = await loadPreset(preset);
      setLoaded({ id: preset.galleryId, manifest: m });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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

  return (
    <section aria-label="checkpoint gallery" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.blurb}
            onClick={() => void applyPreset(p.id)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text hover:border-accent"
          >
            {p.label}
          </button>
        ))}
      </div>
      {!manifest ? (
        <p className="text-xs text-muted">Loading gallery…</p>
      ) : (
        <>
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
                onClick={() => {
                  setTrackId(t);
                  if (focusStep !== null) void focusWithGhosts(manifest, focusStep, t);
                }}
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
            onPick={(step) => void focusWithGhosts(manifest, step, trackId)}
          />
          <ul className="flex flex-col gap-1">
            {manifest.checkpoints.map((cp) => {
              const entry = findEntry(cp, trackId);
              if (!entry) return null;
              const focused = primaryTrack === trackId && cp.step === focusStep;
              const isGhost = ghostSteps.includes(cp.step) && !focused;
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
                    onClick={() => void focusWithGhosts(manifest, cp.step, trackId)}
                    className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted hover:border-muted"
                  >
                    focus
                  </button>
                  <button
                    type="button"
                    aria-label={`ghost ${cp.label} on ${trackId}`}
                    aria-pressed={isGhost}
                    disabled={focused || primaryTrack !== trackId}
                    onClick={() => {
                      if (isGhost) {
                        setGhostSteps((g) => g.filter((x) => x !== cp.step));
                        const car = useTransport
                          .getState()
                          .cars.find(
                            (c) =>
                              c.trajectory.meta.checkpointStep === cp.step &&
                              c.trajectory.meta.trackId === trackId,
                          );
                        if (car) useTransport.getState().removeCar(car.id);
                      } else {
                        setGhostSteps((g) => [...g, cp.step]);
                        void ghostCheckpoint(manifest, ref, cp.step, trackId);
                      }
                    }}
                    className={`rounded-md border px-2 py-1 font-mono text-xs disabled:opacity-30 ${isGhost ? 'border-lateral text-text' : 'border-border text-muted hover:border-muted'}`}
                  >
                    ghost
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
