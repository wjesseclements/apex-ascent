/** Live-mode state a human changes: mode, track, model, run status. */
import { create } from 'zustand';
import { MODELS } from '../data/models';

export type LiveStatus = 'idle' | 'loading' | 'driving' | 'crashed' | 'finished' | 'error';

export interface LiveState {
  mode: 'replay' | 'live';
  trackId: string;
  modelId: string;
  /** Incremented to (re)start a session; the loop watches it. */
  runId: number;
  status: LiveStatus;
  error: string | null;
  /** Sim ticks per wall second, updated by the loop at ≤ 2 Hz. */
  tickRate: number;

  setMode: (mode: 'replay' | 'live') => void;
  setTrack: (trackId: string) => void;
  setModel: (modelId: string) => void;
  start: () => void;
  setStatus: (status: LiveStatus, error?: string | null) => void;
  setTickRate: (rate: number) => void;
}

export const useLive = create<LiveState>((set, get) => ({
  mode: 'replay',
  trackId: 'track_a',
  modelId: MODELS[0]!.id,
  runId: 0,
  status: 'idle',
  error: null,
  tickRate: 0,
  setMode: (mode) => set({ mode }),
  setTrack: (trackId) => set({ trackId }),
  setModel: (modelId) => set({ modelId }),
  start: () => set({ runId: get().runId + 1, status: 'loading', error: null }),
  setStatus: (status, error = null) => set({ status, error }),
  setTickRate: (rate) => set({ tickRate: rate }),
}));
