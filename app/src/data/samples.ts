/** Committed sample trajectories served from app/public/trajectories/. */
export interface SampleTrajectory {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly blurb: string;
}

export const SAMPLES: readonly SampleTrajectory[] = [
  {
    id: 'ppo-a',
    label: 'PPO (γ 0.995) · Track A',
    file: 'ppo-competence-track_a.trajectory.json',
    blurb: 'Slice 6 competence checkpoint (run e7 @ 8M steps) on its training track: 16.02 s laps.',
  },
  {
    id: 'ppo-b',
    label: 'PPO (γ 0.995) · Track B',
    file: 'ppo-competence-track_b.trajectory.json',
    blurb: 'Same checkpoint on a track it never trained on: clean 18.98 s laps.',
  },
  {
    id: 'ppo-mirror',
    label: 'PPO (γ 0.995) · Track A mirrored',
    file: 'ppo-competence-track_a_mirror.trajectory.json',
    blurb: 'Track A as left-handers — also never seen in training: 16.72 s laps.',
  },
  {
    id: 'scripted-a',
    label: 'Scripted driver · Track A',
    file: 'scripted-track_a.trajectory.json',
    blurb: 'The hand-written reference driver (25.7 s laps).',
  },
  {
    id: 'before-b',
    label: 'Before: baseline PPO @ 5M · Track B',
    file: 'ppo-5m-track_b-before.trajectory.json',
    blurb: 'The Slice 4 baseline (γ 0.99) on Track B: crashes at the first left-hander.',
  },
];

export const SAMPLES_BASE_URL = '/trajectories/';
