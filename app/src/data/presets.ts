/** One-click gallery presets (Slice 9): named states worth showing a stranger. */
export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly galleryId: string;
  readonly trackId: string;
  readonly focusStep: number;
  readonly ghostSteps: readonly number[];
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'flip',
    label: 'Show the flip',
    blurb: 'Track B, never trained on: 8M laps it while 13M crashes at the first left-hander.',
    galleryId: 'e7',
    trackId: 'track_b',
    focusStep: 8_000_000,
    ghostSteps: [13_000_000],
  },
  {
    id: 'ladder',
    label: 'The ladder',
    blurb: 'Track A: 250k (first laps) as a ghost behind the 8M competence checkpoint.',
    galleryId: 'e7',
    trackId: 'track_a',
    focusStep: 8_000_000,
    ghostSteps: [250_000, 13_000_000],
  },
  {
    id: 'brakes',
    label: 'Now it brakes',
    blurb: 'The low-drag car (E8a @ 5M) on Track A — watch the g-g dot drop into the brake half.',
    galleryId: 'e8',
    trackId: 'track_a',
    focusStep: 5_013_504,
    ghostSteps: [],
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
