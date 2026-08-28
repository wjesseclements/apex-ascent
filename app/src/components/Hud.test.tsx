import { render, screen } from '@testing-library/react';
import crash from '../../public/trajectories/ppo-5m-track_b.trajectory.json';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { duration, snapshotAt } from '../engine/trajectory';
import { publish, resetBus } from '../store/snapshotBus';
import { useTransport } from '../store/transport';
import { Hud } from './Hud';

function load(raw: unknown, name: string) {
  const r = parseTrajectory(raw);
  if (!r.ok) throw new Error(r.error);
  useTransport.getState().setTrajectory(r.trajectory, name);
  return r.trajectory;
}

beforeEach(() => {
  resetBus();
  useTransport.setState({ trajectory: null, trajectoryName: null, track: null });
});

describe('Hud', () => {
  it('says so when nothing is loaded', () => {
    render(<Hud />);
    expect(screen.getByText(/no trajectory loaded/i)).toBeInTheDocument();
  });
  it('shows speed, lap, lap clock and lap times from the snapshot', () => {
    const tr = load(scripted, 'Scripted');
    publish(snapshotAt(tr, 30), 0, true);
    render(<Hud />);
    expect(screen.getByText('Scripted')).toBeInTheDocument();
    expect(screen.getByText(/scripted · track_a · physics/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // lap 2 at t=30 (lap 1 = 25.7 s)
    expect(screen.getByText(/1 completed/)).toBeInTheDocument();
    expect(screen.getByText('Lap 1')).toBeInTheDocument();
    expect(screen.getByText('25.700')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('shows the crash marker on the final sample of a crashed run', () => {
    const tr = load(crash, 'Crash');
    publish(snapshotAt(tr, duration(tr)), 0, true);
    render(<Hud />);
    expect(screen.getByRole('status')).toHaveTextContent(/CRASH at/);
    expect(screen.getByText(/no completed laps/i)).toBeInTheDocument();
  });
});
