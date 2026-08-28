/** Committed ONNX policies under app/public/models/ (own origin only). */
import type { PhysicsPresetId } from '../engine/sim/config';

export interface ModelRef {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly blurb: string;
  /** The physics the policy was trained under — live mode simulates the same car. */
  readonly physics: PhysicsPresetId;
}

export const MODELS: readonly ModelRef[] = [
  {
    id: 'e7-8m',
    label: 'E7 @ 8M · generalist',
    file: '/models/e7-8m.onnx',
    blurb: 'Laps every track.',
    physics: 'default',
  },
  {
    id: 'e7-13m',
    label: 'E7 @ 13M · specialist',
    file: '/models/e7-13m.onnx',
    blurb: 'Fastest on Track A; crashes elsewhere.',
    physics: 'default',
  },
  {
    id: 'e8a-lowdrag-5m',
    label: 'E8a @ 5M · low drag',
    file: '/models/e8a-lowdrag-5m.onnx',
    blurb: 'Trained with drag 0.05/s: it brakes.',
    physics: 'low-drag',
  },
];
