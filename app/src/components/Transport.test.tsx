import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { resetBus } from '../store/snapshotBus';
import { useTransport } from '../store/transport';
import { Transport } from './Transport';

beforeEach(() => {
  resetBus();
  const r = parseTrajectory(scripted);
  if (!r.ok) throw new Error(r.error);
  useTransport.getState().setTrajectory(r.trajectory, 'x');
  useTransport.setState({ isPlaying: false, speedMult: 1, seekTarget: null });
});

describe('Transport', () => {
  it('play/pause toggles store state only', async () => {
    render(<Transport />);
    await userEvent.click(screen.getByRole('button', { name: 'play' }));
    expect(useTransport.getState().isPlaying).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'pause' }));
    expect(useTransport.getState().isPlaying).toBe(false);
  });
  it('space toggles play unless typing in an input', () => {
    render(<Transport />);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(useTransport.getState().isPlaying).toBe(true);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'scrub' }), { code: 'Space' });
    expect(useTransport.getState().isPlaying).toBe(true);
  });
  it('speed buttons and scrubbing write requests to the store', async () => {
    render(<Transport />);
    await userEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(useTransport.getState().speedMult).toBe(4);
    expect(screen.getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('slider', { name: 'scrub' }), { target: { value: '12.5' } });
    expect(useTransport.getState().seekTarget).toBe(12.5);
    expect(screen.getByText(/\/ 1:00\.000/)).toBeInTheDocument();
  });
  it('is disabled with nothing loaded', () => {
    useTransport.setState({ trajectory: null });
    render(<Transport />);
    expect(screen.getByRole('button', { name: 'play' })).toBeDisabled();
  });
});
