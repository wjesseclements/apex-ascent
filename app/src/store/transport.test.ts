import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { MAX_CARS, ghostRefusal, selectPrimary, useTransport } from './transport';
import crash from '../../public/trajectories/ppo-5m-track_b-before.trajectory.json';

const tr = (() => {
  const r = parseTrajectory(scripted);
  if (!r.ok) throw new Error(r.error);
  return r.trajectory;
})();

beforeEach(() => {
  useTransport.setState({
    cars: [],
    focusIndex: 0,
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
    expect(after.cars.map((c) => c.label)).toEqual(['scripted']);
    expect(after.focusIndex).toBe(0);
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

describe('ghosts (cars is always an array)', () => {
  const crashed = (() => {
    const r = parseTrajectory(crash);
    if (!r.ok) throw new Error(r.error);
    return r.trajectory;
  })();

  it('adds ghosts on the same track and physics, focus stays', () => {
    const s = useTransport.getState();
    s.setTrajectory(tr, 'primary');
    expect(s.addGhost(tr, 'ghost')).toBeNull();
    const after = useTransport.getState();
    expect(after.cars.map((c) => c.label)).toEqual(['primary', 'ghost']);
    expect(after.focusIndex).toBe(0);
    expect(selectPrimary(after)?.label).toBe('primary');
  });
  it('refuses a ghost on a different track, with a named reason', () => {
    const s = useTransport.getState();
    s.setTrajectory(tr, 'primary');
    const why = s.addGhost(crashed, 'other track');
    expect(why).toMatch(/track_b.*track_a/);
    expect(useTransport.getState().cars).toHaveLength(1);
    expect(useTransport.getState().loadError).toMatch(/other track/);
  });
  it('refuses a ghost with a different physics hash', () => {
    const different = { ...tr, meta: { ...tr.meta, physicsConfigHash: '000000000000' } };
    expect(ghostRefusal(tr, different)).toMatch(/physics 000000000000 differs/);
    expect(ghostRefusal(tr, tr)).toBeNull();
  });
  it('adding a ghost with nothing loaded loads it as the primary', () => {
    expect(useTransport.getState().addGhost(tr, 'first')).toBeNull();
    expect(useTransport.getState().cars.map((c) => c.label)).toEqual(['first']);
  });
  it('caps the number of cars', () => {
    const s = useTransport.getState();
    s.setTrajectory(tr, 'p');
    for (let i = 1; i < MAX_CARS; i++) expect(s.addGhost(tr, `g${i}`)).toBeNull();
    expect(s.addGhost(tr, 'too many')).toMatch(/at most/);
  });
  it('focus and removal keep the index valid', () => {
    const s = useTransport.getState();
    s.setTrajectory(tr, 'a');
    s.addGhost(tr, 'b');
    s.addGhost(tr, 'c');
    s.setFocus(2);
    expect(selectPrimary(useTransport.getState())?.label).toBe('c');
    s.setFocus(9); // ignored
    expect(useTransport.getState().focusIndex).toBe(2);
    const idA = useTransport.getState().cars[0]!.id;
    s.removeCar(idA); // removing before the focus shifts it down
    expect(useTransport.getState().focusIndex).toBe(1);
    expect(selectPrimary(useTransport.getState())?.label).toBe('c');
    s.removeCar(useTransport.getState().cars[1]!.id); // remove the focused (last) car
    expect(selectPrimary(useTransport.getState())?.label).toBe('b');
    s.removeCar(useTransport.getState().cars[0]!.id);
    expect(useTransport.getState().cars).toHaveLength(0);
    expect(useTransport.getState().track).toBeNull();
  });
});
