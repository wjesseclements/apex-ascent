import { useLive } from './live';

beforeEach(() =>
  useLive.setState({
    mode: 'replay',
    trackId: 'track_a',
    modelId: 'e7-8m',
    runId: 0,
    status: 'idle',
    error: null,
    tickRate: 0,
  }),
);

describe('live store', () => {
  it('mode, track, model, start, status', () => {
    const s = useLive.getState();
    s.setMode('live');
    s.setTrack('track_b');
    s.setModel('e7-13m');
    s.start();
    expect(useLive.getState()).toMatchObject({
      mode: 'live',
      trackId: 'track_b',
      modelId: 'e7-13m',
      runId: 1,
      status: 'loading',
      error: null,
    });
    s.start();
    expect(useLive.getState().runId).toBe(2);
    s.setStatus('error', 'boom');
    expect(useLive.getState()).toMatchObject({ status: 'error', error: 'boom' });
    s.setTickRate(60);
    expect(useLive.getState().tickRate).toBe(60);
  });
});
