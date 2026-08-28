import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { selectPrimary, useTransport } from '../store/transport';
import { loadFile, loadRawTrajectory, loadSample } from './loadTrajectory';

beforeEach(() => {
  useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
});

describe('loadTrajectory', () => {
  it('loads a valid document into the store', () => {
    expect(loadRawTrajectory(scripted, 'x')).toBe(true);
    expect(selectPrimary(useTransport.getState())?.label).toBe('x');
  });
  it('rejects an invalid document with a named error', () => {
    expect(loadRawTrajectory({ meta: { schemaVersion: 9 } }, 'bad.json')).toBe(false);
    expect(useTransport.getState().loadError).toMatch(
      /bad\.json: unsupported trajectory schemaVersion 9/,
    );
    expect(useTransport.getState().cars).toHaveLength(0);
  });
  it('fetches a committed sample from the app origin only', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => scripted,
    }));
    vi.stubGlobal('fetch', fetchMock);
    await loadSample('scripted-a');
    expect(fetchMock).toHaveBeenCalledWith('/trajectories/scripted-track_a.trajectory.json');
    expect(selectPrimary(useTransport.getState())?.label).toBe('Scripted driver · Track A');
  });
  it('reports HTTP and network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    await loadSample('ppo-b');
    expect(useTransport.getState().loadError).toMatch(/HTTP 404/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await loadSample('ppo-b');
    expect(useTransport.getState().loadError).toMatch(/offline/);
    await expect(loadSample('nope')).rejects.toThrow(/unknown sample/);
  });
  it('the test fetch trap is armed', async () => {
    await loadSample('ppo-a');
    expect(useTransport.getState().loadError).toMatch(/network access in tests is forbidden/);
  });
  it('reads a file and reports non-JSON', async () => {
    await loadFile(new File([JSON.stringify(scripted)], 'mine.json', { type: 'application/json' }));
    expect(selectPrimary(useTransport.getState())?.label).toBe('mine.json');
    await loadFile(new File(['{not json'], 'broken.json'));
    expect(useTransport.getState().loadError).toMatch(/broken\.json/);
  });
});
