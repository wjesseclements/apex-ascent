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
    label: 'PPO @ 5M steps · Track A',
    file: 'ppo-5m-track_a.trajectory.json',
    blurb: 'The Slice 4 baseline agent: three clean laps, best 16.18 s.',
  },
  {
    id: 'scripted-a',
    label: 'Scripted driver · Track A',
    file: 'scripted-track_a.trajectory.json',
    blurb: 'The hand-written reference driver (25.7 s laps).',
  },
  {
    id: 'ppo-b',
    label: 'PPO @ 5M steps · Track B',
    file: 'ppo-5m-track_b.trajectory.json',
    blurb: 'Same agent on the unseen track: it crashes at the first left-hander.',
  },
];

export const SAMPLES_BASE_URL = '/trajectories/';
