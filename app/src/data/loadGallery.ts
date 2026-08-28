/** Fetch a gallery manifest and its trajectories from the app's own origin. */
import { findEntry, parseGalleryManifest, type GalleryManifest } from '../engine/gallery';
import { parseTrajectory, type Trajectory } from '../engine/schema';
import { useTransport } from '../store/transport';
import { GALLERIES, type GalleryRef } from './galleries';
import type { Preset } from './presets';

export function galleryRef(id: string): GalleryRef {
  const ref = GALLERIES.find((g) => g.id === id);
  if (!ref) throw new Error(`unknown gallery ${id}`);
  return ref;
}

export async function fetchManifest(ref: GalleryRef): Promise<GalleryManifest> {
  const res = await fetch(`${ref.path}manifest.json`);
  if (!res.ok) throw new Error(`${ref.id}: HTTP ${res.status}`);
  const r = parseGalleryManifest(await res.json());
  if (!r.ok) throw new Error(`${ref.id}: ${r.error}`);
  return r.manifest;
}

const cache = new Map<string, Promise<Trajectory>>();

export function fetchGalleryTrajectory(ref: GalleryRef, file: string): Promise<Trajectory> {
  const key = `${ref.path}${file}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(key);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const r = parseTrajectory(await res.json());
    if (!r.ok) throw new Error(`${file}: ${r.error}`);
    return r.trajectory;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export function checkpointLabel(manifest: GalleryManifest, step: number): string {
  return manifest.checkpoints.find((c) => c.step === step)?.label ?? `${step}`;
}

/** Load one checkpoint on one track as the primary car (replaces everything). */
export async function focusCheckpoint(
  manifest: GalleryManifest,
  ref: GalleryRef,
  step: number,
  trackId: string,
): Promise<void> {
  const cp = manifest.checkpoints.find((c) => c.step === step);
  const entry = cp && findEntry(cp, trackId);
  const store = useTransport.getState();
  if (!entry) {
    store.setLoadError(`${checkpointLabel(manifest, step)} was not evaluated on ${trackId}`);
    return;
  }
  try {
    const tr = await fetchGalleryTrajectory(ref, entry.file);
    store.setTrajectory(tr, `${cp.label} · ${trackId}`);
  } catch (e) {
    store.setLoadError(e instanceof Error ? e.message : String(e));
  }
}

/** Add one checkpoint on one track as a ghost of the current primary. */
export async function ghostCheckpoint(
  manifest: GalleryManifest,
  ref: GalleryRef,
  step: number,
  trackId: string,
): Promise<void> {
  const cp = manifest.checkpoints.find((c) => c.step === step);
  const entry = cp && findEntry(cp, trackId);
  const store = useTransport.getState();
  if (!entry) {
    store.setLoadError(`${checkpointLabel(manifest, step)} was not evaluated on ${trackId}`);
    return;
  }
  try {
    const tr = await fetchGalleryTrajectory(ref, entry.file);
    store.addGhost(tr, `${cp.label} · ${trackId}`);
  } catch (e) {
    store.setLoadError(e instanceof Error ? e.message : String(e));
  }
}

/** The landing state: focus one checkpoint, add the listed ghosts. */
export async function loadLanding(
  ref: GalleryRef,
  trackId: string,
  focusStep: number,
  ghostSteps: readonly number[],
): Promise<GalleryManifest> {
  const manifest = await fetchManifest(ref);
  await focusCheckpoint(manifest, ref, focusStep, trackId);
  for (const step of ghostSteps) await ghostCheckpoint(manifest, ref, step, trackId);
  return manifest;
}

/** Load a preset: switch gallery, focus its checkpoint on its track, add its ghosts. */
export async function loadPreset(preset: Preset): Promise<GalleryManifest> {
  return loadLanding(
    galleryRef(preset.galleryId),
    preset.trackId,
    preset.focusStep,
    preset.ghostSteps,
  );
}
