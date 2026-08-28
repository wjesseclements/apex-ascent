import { act, render } from '@testing-library/react';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { getSnapshot, resetBus } from '../store/snapshotBus';
import { useTransport } from '../store/transport';
import { TrackCanvas } from './TrackCanvas';

// jsdom has no 2D canvas: getContext returns null. The loop must still run the clock
// and publish snapshots — the HUD path is what we can verify headlessly.

beforeEach(() => {
  resetBus();
  useTransport.setState({ trajectory: null, track: null, isPlaying: false, seekTarget: null });
});

describe('TrackCanvas', () => {
  it('renders a canvas and publishes the initial snapshot when a trajectory loads', () => {
    const r = parseTrajectory(scripted);
    if (!r.ok) throw new Error(r.error);
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const { getByRole, unmount } = render(<TrackCanvas />);
    expect(getByRole('img', { name: 'track replay' })).toBeInTheDocument();
    expect(getSnapshot()).toBeNull();

    act(() => useTransport.getState().setTrajectory(r.trajectory, 'x'));
    expect(getSnapshot()?.t).toBe(0);

    // seek request is consumed on the next frame; playing advances the clock
    act(() => {
      useTransport.getState().seek(10);
      useTransport.getState().play();
      frame!(1000);
      frame!(1016);
    });
    expect(useTransport.getState().seekTarget).toBeNull();
    expect(getSnapshot()!.t).toBeCloseTo(10.016, 3);
    unmount();
  });
});
