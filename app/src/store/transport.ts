/**
 * Discrete state a HUMAN changes, and nothing else (CLAUDE.md app rule 1).
 *
 * The live clock lives in a ref inside the render loop and is never store or
 * React state — a store write per animation frame would re-render every
 * subscriber 60 times a second. What lives here changes on a click or a
 * keypress: load, add/remove a ghost, focus, play/pause, speed, a scrub REQUEST.
 *
 * `cars` is always an array (rule 2): the focused car drives the HUD, the
 * clock and the transport's duration; every other car is a ghost drawn on the
 * same clock. Ghosts must share the focused car's track and physics config
 * hash — otherwise the overlay would be meaningless, so the guard refuses.
 *
 * `seekTarget` is a request, not a position: the scrubber writes the target,
 * the next frame moves the clock and calls `consumeSeek()`.
 */
import { create } from 'zustand';
import { getTrack } from '../data/tracks';
import type { Trajectory } from '../engine/schema';
import type { Track } from '../engine/track';
import { prefersReducedMotion } from './motion';

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;
export const MAX_CARS = 6;

export interface CarEntry {
  readonly id: string;
  readonly label: string;
  readonly trajectory: Trajectory;
}

export interface TransportState {
  cars: CarEntry[];
  /** Index into `cars` of the car the HUD, clock and transport follow. */
  focusIndex: number;
  track: Track | null;
  isPlaying: boolean;
  speedMult: number;
  seekTarget: number | null;
  loadError: string | null;

  /** Replace every car with one; rewinds. */
  setTrajectory: (trajectory: Trajectory, label: string) => void;
  /** Add a ghost on the same track/physics; returns an error string if refused. */
  addGhost: (trajectory: Trajectory, label: string) => string | null;
  removeCar: (id: string) => void;
  setFocus: (index: number) => void;
  setLoadError: (message: string | null) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (mult: number) => void;
  seek: (seconds: number) => void;
  consumeSeek: () => void;
}

let nextId = 1;
const newId = () => `car-${nextId++}`;

/** The focused car, or null with nothing loaded. */
export function selectPrimary(s: Pick<TransportState, 'cars' | 'focusIndex'>): CarEntry | null {
  return s.cars[s.focusIndex] ?? null;
}

export function selectTrajectory(
  s: Pick<TransportState, 'cars' | 'focusIndex'>,
): Trajectory | null {
  return selectPrimary(s)?.trajectory ?? null;
}

/** Why `candidate` cannot be overlaid on `primary`, or null if it can. */
export function ghostRefusal(primary: Trajectory, candidate: Trajectory): string | null {
  if (candidate.meta.trackId !== primary.meta.trackId) {
    return `ghost is on ${candidate.meta.trackId}, the focused car is on ${primary.meta.trackId}`;
  }
  if (candidate.meta.physicsConfigHash !== primary.meta.physicsConfigHash) {
    return `ghost physics ${candidate.meta.physicsConfigHash} differs from the focused car's ${primary.meta.physicsConfigHash}; overlaying them would compare different cars`;
  }
  return null;
}

export const useTransport = create<TransportState>((set, get) => ({
  cars: [],
  focusIndex: 0,
  track: null,
  isPlaying: false,
  speedMult: 1,
  seekTarget: null,
  loadError: null,

  setTrajectory: (trajectory, label) =>
    set({
      cars: [{ id: newId(), label, trajectory }],
      focusIndex: 0,
      track: getTrack(trajectory.meta.trackId),
      loadError: null,
      seekTarget: 0,
      // Reduced motion turns AUTOPLAY off, not the feature: play/pause still work.
      isPlaying: !prefersReducedMotion(),
    }),
  addGhost: (trajectory, label) => {
    const s = get();
    const primary = selectTrajectory(s);
    if (!primary) {
      s.setTrajectory(trajectory, label);
      return null;
    }
    const why = ghostRefusal(primary, trajectory);
    if (why) {
      set({ loadError: `${label}: ${why}` });
      return why;
    }
    if (s.cars.length >= MAX_CARS) {
      const msg = `at most ${MAX_CARS} cars at once`;
      set({ loadError: `${label}: ${msg}` });
      return msg;
    }
    set({ cars: [...s.cars, { id: newId(), label, trajectory }], loadError: null });
    return null;
  },
  removeCar: (id) => {
    const s = get();
    const idx = s.cars.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const cars = s.cars.filter((c) => c.id !== id);
    let focusIndex = s.focusIndex;
    if (idx < focusIndex) focusIndex -= 1;
    if (focusIndex >= cars.length) focusIndex = Math.max(0, cars.length - 1);
    set({ cars, focusIndex, track: cars.length ? s.track : null });
  },
  setFocus: (index) => {
    const s = get();
    if (index >= 0 && index < s.cars.length) set({ focusIndex: index });
  },
  setLoadError: (message) => set({ loadError: message }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setSpeed: (mult) => set({ speedMult: mult }),
  seek: (seconds) => set({ seekTarget: seconds }),
  consumeSeek: () => set({ seekTarget: null }),
}));
