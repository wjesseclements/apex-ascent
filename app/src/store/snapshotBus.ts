/**
 * The ≤30 Hz bridge from the render loop to the HUD (CLAUDE.md app rule 1).
 *
 * The loop calls `publish(snapshot)` every frame; subscribers are notified at
 * most every `HUD_INTERVAL_MS`. The HUD reads it through `useSyncExternalStore`,
 * so React re-renders the HUD at ≤30 fps and nothing else.
 */
import { useSyncExternalStore } from 'react';
import type { CarSnapshot } from '../engine/trajectory';

export const HUD_INTERVAL_MS = 1000 / 30;

type Listener = () => void;
let latest: CarSnapshot | null = null;
let lastNotifyMs = -Infinity;
const listeners = new Set<Listener>();

export function publish(snapshot: CarSnapshot | null, nowMs: number, force = false): void {
  latest = snapshot;
  if (force || nowMs - lastNotifyMs >= HUD_INTERVAL_MS) {
    lastNotifyMs = nowMs;
    for (const l of listeners) l();
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSnapshot = (): CarSnapshot | null => latest;

/** Test helper: forget everything. */
export function resetBus(): void {
  latest = null;
  lastNotifyMs = -Infinity;
  listeners.clear();
}

export function useCarSnapshot(): CarSnapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
