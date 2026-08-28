/**
 * Discrete state a HUMAN changes, and nothing else (CLAUDE.md app rule 1).
 *
 * The live clock lives in a ref inside the render loop and is never store or
 * React state — a store write per animation frame would re-render every
 * subscriber 60 times a second. What lives here changes on a click or a
 * keypress: load, play/pause, speed, a scrub REQUEST.
 *
 * `seekTarget` is a request, not a position: the scrubber writes the target,
 * the next frame moves the clock and calls `consumeSeek()`. Storing the
 * resulting position would put the clock back in the store by the back door.
 *
 * The render loop reads this store with `useTransport.getState()` inside its
 * frame callback rather than subscribing, so transport changes never
 * re-render the canvas.
 */
import { create } from 'zustand';
import { getTrack } from '../data/tracks';
import type { Trajectory } from '../engine/schema';
import type { Track } from '../engine/track';
import { prefersReducedMotion } from './motion';

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

export interface TransportState {
  trajectory: Trajectory | null;
  /** Human-readable name of the loaded trajectory (sample label or file name). */
  trajectoryName: string | null;
  track: Track | null;
  isPlaying: boolean;
  speedMult: number;
  seekTarget: number | null;
  loadError: string | null;

  setTrajectory: (trajectory: Trajectory, name: string) => void;
  setLoadError: (message: string | null) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (mult: number) => void;
  seek: (seconds: number) => void;
  consumeSeek: () => void;
}

export const useTransport = create<TransportState>((set, get) => ({
  trajectory: null,
  trajectoryName: null,
  track: null,
  isPlaying: false,
  speedMult: 1,
  seekTarget: null,
  loadError: null,

  setTrajectory: (trajectory, name) =>
    set({
      trajectory,
      trajectoryName: name,
      track: getTrack(trajectory.meta.trackId),
      loadError: null,
      seekTarget: 0,
      // Reduced motion turns AUTOPLAY off, not the feature: play/pause still work.
      isPlaying: !prefersReducedMotion(),
    }),
  setLoadError: (message) => set({ loadError: message }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setSpeed: (mult) => set({ speedMult: mult }),
  seek: (seconds) => set({ seekTarget: seconds }),
  consumeSeek: () => set({ seekTarget: null }),
}));
