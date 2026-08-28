/** Committed ONNX policies under app/public/models/ (own origin only). */
export interface ModelRef {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly blurb: string;
}

export const MODELS: readonly ModelRef[] = [
  {
    id: 'e7-8m',
    label: 'E7 @ 8M · generalist',
    file: '/models/e7-8m.onnx',
    blurb: 'Laps every track.',
  },
  {
    id: 'e7-13m',
    label: 'E7 @ 13M · specialist',
    file: '/models/e7-13m.onnx',
    blurb: 'Fastest on Track A; crashes elsewhere.',
  },
];
