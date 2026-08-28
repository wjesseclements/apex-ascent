/**
 * URL deep links: `?mode=live&track=track_b&model=e7-13m&autostart=1`.
 * Read once on mount; unknown values are ignored (never trusted blindly).
 */
import { MODELS } from './models';
import { findPreset } from './presets';
import { TRACK_IDS } from './tracks';
import { useLive } from '../store/live';

export interface DeepLink {
  /** A gallery preset id (see presets.ts), applied by the Gallery on mount. */
  preset?: string;
  mode?: 'replay' | 'live';
  trackId?: string;
  modelId?: string;
  autostart: boolean;
}

export function parseDeepLink(search: string): DeepLink {
  const q = new URLSearchParams(search);
  const mode = q.get('mode');
  const track = q.get('track');
  const model = q.get('model');
  const preset = q.get('preset');
  return {
    preset: preset && findPreset(preset) ? preset : undefined,
    mode: mode === 'live' || mode === 'replay' ? mode : undefined,
    trackId: track && TRACK_IDS.includes(track) ? track : undefined,
    modelId: model && MODELS.some((m) => m.id === model) ? model : undefined,
    autostart: q.get('autostart') === '1',
  };
}

/** Apply a deep link to the live store; returns true if a live run was started. */
export function applyDeepLink(link: DeepLink): boolean {
  const live = useLive.getState();
  if (link.trackId) live.setTrack(link.trackId);
  if (link.modelId) live.setModel(link.modelId);
  if (link.mode) live.setMode(link.mode);
  if (link.mode === 'live' && link.autostart) {
    live.start();
    return true;
  }
  return false;
}
