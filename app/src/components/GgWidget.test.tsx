import { render, screen } from '@testing-library/react';
import competence from '../../public/trajectories/ppo-competence-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { snapshotAt } from '../engine/trajectory';
import { publish, resetBus } from '../store/snapshotBus';
import { useTransport } from '../store/transport';
import { GgWidget } from './GgWidget';

beforeEach(() => {
  resetBus();
  useTransport.setState({ cars: [], focusIndex: 0, track: null });
});

describe('GgWidget', () => {
  it('renders nothing without a trajectory', () => {
    const { container } = render(<GgWidget />);
    expect(container).toBeEmptyDOMElement();
  });
  it('draws the circle, the dot and the metrics from the focused car', () => {
    const r = parseTrajectory(competence);
    if (!r.ok) throw new Error(r.error);
    useTransport.getState().setTrajectory(r.trajectory, 'ppo');
    publish(snapshotAt(r.trajectory, 20), 0, true);
    render(<GgWidget />);
    expect(screen.getByRole('img', { name: 'g-g diagram' })).toBeInTheDocument();
    expect(screen.getByText('trail-braking ticks')).toBeInTheDocument();
    expect(screen.getByText('brake events')).toBeInTheDocument();
    expect(screen.getByText(/excludes drag/)).toBeInTheDocument();
    expect(screen.getByText('1:00.000')).toBeInTheDocument(); // episode length
  });
});
