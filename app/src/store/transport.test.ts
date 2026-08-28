import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { useTransport } from './transport';

const tr = (() => {
  const r = parseTrajectory(scripted);
  if (!r.ok) throw new Error(r.error);
  return r.trajectory;
})();

beforeEach(() => {
  useTransport.setState({
    trajectory: null,
    trajectoryName: null,
    track: null,
    isPlaying: false,
    speedMult: 1,
    seekTarget: null,
    loadError: null,
  });
});

describe('transport store', () => {
  it('holds only discrete state and resolves the track on load', () => {
    const s = useTransport.getState();
    s.setTrajectory(tr, 'scripted');
    const after = useTransport.getState();
    expect(after.trajectoryName).toBe('scripted');
    expect(after.track?.name).toBe('track_a');
    expect(after.isPlaying).toBe(true); // autoplay unless reduced motion
    expect(after.seekTarget).toBe(0); // rewind request, consumed by the loop
    expect(after.loadError).toBeNull();
    expect(Object.keys(after)).not.toContain('clock');
  });
  it('play / pause / toggle / speed', () => {
    const s = useTransport.getState();
    s.play();
    expect(useTransport.getState().isPlaying).toBe(true);
    s.pause();
    expect(useTransport.getState().isPlaying).toBe(false);
    s.togglePlay();
    expect(useTransport.getState().isPlaying).toBe(true);
    s.setSpeed(4);
    expect(useTransport.getState().speedMult).toBe(4);
  });
  it('seek is a request the loop consumes', () => {
    const s = useTransport.getState();
    s.seek(12.5);
    expect(useTransport.getState().seekTarget).toBe(12.5);
    s.consumeSeek();
    expect(useTransport.getState().seekTarget).toBeNull();
  });
  it('load errors are recorded and cleared by a successful load', () => {
    useTransport.getState().setLoadError('bad');
    expect(useTransport.getState().loadError).toBe('bad');
    useTransport.getState().setTrajectory(tr, 'ok');
    expect(useTransport.getState().loadError).toBeNull();
  });
});
