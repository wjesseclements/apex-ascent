import { applyDeepLink, parseDeepLink } from './deepLink';
import { useLive } from '../store/live';

beforeEach(() =>
  useLive.setState({
    mode: 'replay',
    trackId: 'track_a',
    modelId: 'e7-8m',
    runId: 0,
    status: 'idle',
  }),
);

describe('deep links', () => {
  it('parses known values and ignores unknown ones', () => {
    expect(parseDeepLink('?mode=live&track=track_b&model=e7-13m&autostart=1')).toEqual({
      mode: 'live',
      trackId: 'track_b',
      modelId: 'e7-13m',
      autostart: true,
    });
    expect(parseDeepLink('?mode=hack&track=../etc&model=x')).toEqual({
      mode: undefined,
      trackId: undefined,
      modelId: undefined,
      autostart: false,
    });
    expect(parseDeepLink('')).toEqual({
      mode: undefined,
      trackId: undefined,
      modelId: undefined,
      autostart: false,
    });
  });
  it('applies to the live store and starts only when asked', () => {
    expect(applyDeepLink(parseDeepLink('?mode=live&track=track_b&model=e7-13m'))).toBe(false);
    expect(useLive.getState()).toMatchObject({
      mode: 'live',
      trackId: 'track_b',
      modelId: 'e7-13m',
      runId: 0,
    });
    expect(applyDeepLink(parseDeepLink('?mode=live&autostart=1'))).toBe(true);
    expect(useLive.getState().runId).toBe(1);
    applyDeepLink(parseDeepLink('?mode=replay'));
    expect(useLive.getState().mode).toBe('replay');
  });
});
